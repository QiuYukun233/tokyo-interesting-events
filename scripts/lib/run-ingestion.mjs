import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import robotsParser from 'robots-parser';
import { classifyActivity, filterAndDedupeActivities } from '../../lib/activity-filter.mjs';
import { readCsvRecords } from '../../lib/csv.mjs';
import { openPool, upsertCandidate } from '../../lib/pool-db.mjs';
import { formatAlert, updateRegistry } from '../../lib/source-health.mjs';

const ROOT = new URL('../../', import.meta.url);
const REVIEW_OUTPUT = new URL('data/review-events.json', ROOT);
const MANUAL = new URL('data/manual-events.json', ROOT);
const REGISTRY = new URL('data/source-registry.json', ROOT);
const POOL = new URL('data/pool.db', ROOT);
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
  // Optional: a source may fold its rows into fewer candidates. 方案 §4.3 —
  // 220 comedy bills at one theatre are one answer to "where should we go",
  // not 220. The rows are still parsed; `aggregate` decides what a candidate
  // is. Returning nothing from it means "no candidate", not "crawl failed".
  return { events: source.aggregate ? source.aggregate(events, source) : events, robotsUnavailable };
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

  // Everything the crawl found goes into the pool, whatever the filter thought
  // of it. The pool is the record; publication is a separate decision recorded
  // in its own table, so this write can never undo a ruling. New candidates
  // land with no decision row, which is what "pending in the back office" is.
  const pool = openPool(fileURLToPath(POOL));
  // Every pooled candidate carries its reason/signal codes, not just the ones
  // the crawl-time filter routed to review/excluded. Without this, a `keep`
  // decision's positive signals (e.g. signal:theater) never reached the pool,
  // leaving lib/gate-evidence.mjs unable to ever judge whether that signal is
  // a reliable one — the whole point of recording it in the first place.
  const codesFor = new Map();
  for (const activity of rawFetched) codesFor.set(activity.id, classifyActivity(activity));
  for (const activity of tradeOnly) codesFor.set(activity.id, { reasons: ['review:trade_only_admission'], signals: [] });
  let stored = 0;
  for (const activity of [...rawFetched, ...(await readJson(MANUAL, { events: [] })).events]) {
    if (!activity?.id || !activity?.startDate) continue;
    upsertCandidate(pool, activity, { now, ...codesFor.get(activity.id) });
    stored += 1;
  }

  const tokyoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T') + '+09:00';

  // The review queue stays as a diagnostic surface; see docs/架构.md.
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
    writeFile(REVIEW_OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, sourceStatus, events: review }, null, 2)}
`),
    writeFile(REGISTRY, `${JSON.stringify(registry, null, 2)}
`),
  ]);
  pool.close();

  console.log(`Pooled ${stored} candidates from ${successful.length}/${sources.length} sources. Review queue ${review.length}.`);
  console.log('Run `npm run export-site` to refresh what the site shows.');
  for (const alert of registry.alerts) console.warn(formatAlert(alert));
}
