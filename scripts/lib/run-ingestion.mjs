import { readFile, writeFile } from 'node:fs/promises';
import robotsParser from 'robots-parser';
import { filterAndDedupeActivities } from '../../lib/activity-filter.mjs';
import { readCsvRecords } from '../../lib/csv.mjs';
import { formatAlert, updateRegistry } from '../../lib/source-health.mjs';

const ROOT = new URL('../../', import.meta.url);
const OUTPUT = new URL('data/events.json', ROOT);
const REVIEW_OUTPUT = new URL('data/review-events.json', ROOT);
const MANUAL = new URL('data/manual-events.json', ROOT);
const REGISTRY = new URL('data/source-registry.json', ROOT);
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';

/**
 * Decide whether robots.txt permits this fetch.
 *
 * RFC 9309 §2.3.1: a 4xx means no robots.txt is available and the crawler may
 * access the site; 5xx and 429 mean "unknown", and a well-behaved crawler stays
 * out. Waseda sits behind a Cloudflare challenge that answers 403 on
 * /robots.txt while serving the event list normally — treating that as a ban
 * silently removed a source that never asked to be excluded. Unavailability is
 * reported so it shows up in the registry instead of being invisible.
 *
 * @returns {Promise<{robotsUnavailable: boolean}>}
 * @throws when robots.txt disallows the URL, or its status makes the answer unknowable
 */
export async function assertRobotsAllowed(source, fetchImpl) {
  const robotsUrl = new URL('/robots.txt', source.origin || source.url);
  const response = await fetchImpl(robotsUrl, { headers: { 'user-agent': USER_AGENT } });
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`${source.name} robots.txt returned ${response.status}; refusing to crawl until it is readable`);
  }
  // 404 is the ordinary "this site has no robots.txt" and needs no alert.
  // Any other 4xx means something is answering in robots.txt's place — worth surfacing.
  if (response.status === 404) return { robotsUnavailable: false };
  if (!response.ok) return { robotsUnavailable: true };
  const robots = robotsParser(robotsUrl.href, await response.text());
  if (robots.isAllowed(source.url, USER_AGENT) === false) throw new Error(`${source.name} disallows crawling ${source.url}`);
  return { robotsUnavailable: false };
}

/**
 * Turn one fetched page into event candidates, according to how the source
 * publishes. `html` sources get the text and parse it themselves; `csv` and
 * `json` sources get already-structured records and only map fields.
 */
async function readPage(response, source, pageSource) {
  switch (source.accessMethod) {
    case 'csv': {
      const { records } = readCsvRecords(new Uint8Array(await response.arrayBuffer()));
      return records.map((record, index) => source.map(record, pageSource, index)).filter(Boolean);
    }
    case 'json': {
      const payload = await response.json();
      return (source.select ? source.select(payload) : payload).map((item, index) => source.map(item, pageSource, index)).filter(Boolean);
    }
    default:
      return source.parse(await response.text(), pageSource);
  }
}

export async function fetchSourcePages(source, fetchImpl = fetch) {
  const urls = source.urls?.length ? source.urls : [source.url];
  const events = [];
  let robotsUnavailable = false;
  for (const url of urls) {
    const pageSource = { ...source, url };
    const robots = await assertRobotsAllowed(pageSource, fetchImpl);
    robotsUnavailable ||= robots.robotsUnavailable;
    const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) throw new Error(`${source.name} returned ${response.status} for ${url}`);
    events.push(...await readPage(response, source, pageSource));
  }
  return { events, robotsUnavailable };
}

/**
 * `limit` bounds the pool, not the page. It was 80, which stopped binding on
 * supply and started binding on the horizon: after the open-data and hands-on
 * sources landed, 80 truncated the pool at one month out and silently dropped
 * 文学フリマ, COMIC CITY and 模型ホビーショー from Big Sight's tail. 300 covers the
 * full 180-day horizon with room to spare.
 *
 * Note this file is imported at build time by the front end, which currently
 * renders the whole pool — see docs/信息获取管道设计.md.
 */
function mergeEvents({ manual, fetched, existing, now, limit = 300, horizonDays = 180 }) {
  const cutoff = new Date(now.getTime() + horizonDays * 86400000);
  const prioritized = [...existing, ...fetched, ...manual];
  return [...new Map(prioritized.map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()]
    .filter((event) => {
      const starts = new Date(`${event.startDate}T00:00:00+09:00`);
      const ends = new Date(`${event.endDate || event.startDate}T23:59:59+09:00`);
      return ends >= now && starts <= cutoff;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}

const isPubliclyAccessible = (event) => event.source !== 'Tokyo Big Sight' || /一般/.test(event.audience || '');

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function runIngestion(sources) {
  const now = new Date();
  const results = await Promise.allSettled(sources.map(async (source) => ({ source, ...await fetchSourcePages(source) })));
  const successful = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failures = results.filter((result) => result.status === 'rejected');
  if (!successful.length) throw new AggregateError(failures.map((result) => result.reason), 'All event sources failed');
  for (const result of failures) console.error(`Source failed: ${result.reason?.message || result.reason}`);

  const rawFetched = successful.flatMap(({ events }) => events);
  const tradeOnly = rawFetched.filter((event) => !isPubliclyAccessible(event));
  const fetchedTriage = filterAndDedupeActivities(rawFetched.filter(isPubliclyAccessible));
  const manual = (await readJson(MANUAL, { events: [] })).events;
  const existing = (await readJson(OUTPUT, { events: [] })).events;
  const existingTriage = filterAndDedupeActivities(existing.filter(isPubliclyAccessible));
  const events = mergeEvents({ manual, fetched: fetchedTriage.activities, existing: existingTriage.activities, now });

  const tokyoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T') + '+09:00';
  const updatedAtLabel = `今日 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;

  // The review queue is a diagnostic surface, not a gate: everything here is
  // also published. See docs/架构.md and 决策记录/0002.
  const review = [
    ...tradeOnly.map((activity) => ({ activity, decision: 'review', reasons: ['review:trade_only_admission'], signals: [] })),
    ...fetchedTriage.review,
    ...fetchedTriage.excluded,
  ];

  const perSource = sources.map((source, index) => {
    const result = results[index];
    return result.status === 'fulfilled'
      ? { ok: true, count: result.value.events.length, robotsUnavailable: result.value.robotsUnavailable }
      : { ok: false, count: 0, error: String(result.reason?.message || result.reason) };
  });
  const sourceStatus = sources.map((source, index) => ({
    name: source.name,
    ok: perSource[index].ok,
    count: perSource[index].count,
    pages: source.urls?.length || 1,
    error: perSource[index].error,
  }));

  const registry = updateRegistry(await readJson(REGISTRY, { entries: [] }), sources, perSource, now);

  await Promise.all([
    writeFile(OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, updatedAtLabel, sourceStatus, events }, null, 2)}\n`),
    writeFile(REVIEW_OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, sourceStatus, events: review }, null, 2)}\n`),
    writeFile(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`),
  ]);

  console.log(`Updated ${events.length} events from ${successful.length}/${sources.length} sources. Excluded ${fetchedTriage.excluded.length + existingTriage.excluded.length}; review ${review.length}.`);
  for (const alert of registry.alerts) console.warn(formatAlert(alert));
}
