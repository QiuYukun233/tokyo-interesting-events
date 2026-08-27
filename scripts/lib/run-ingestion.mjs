import { readFile, writeFile } from 'node:fs/promises';
import robotsParser from 'robots-parser';
import { filterAndDedupeActivities } from '../../lib/activity-filter-v2.mjs';

const ROOT = new URL('../../', import.meta.url);
const OUTPUT = new URL('data/events.json', ROOT);
const REVIEW_OUTPUT = new URL('data/review-events.json', ROOT);
const MANUAL = new URL('data/manual-events.json', ROOT);
const USER_AGENT = 'TokyoInterestingEvents/0.4 (+contact via repository)';

async function assertRobotsAllowed(source) {
  const robotsUrl = new URL('/robots.txt', source.origin || source.url);
  const response = await fetch(robotsUrl, { headers: { 'user-agent': USER_AGENT } });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`${source.name} robots.txt returned ${response.status}`);
  const robots = robotsParser(robotsUrl.href, await response.text());
  if (robots.isAllowed(source.url, USER_AGENT) === false) throw new Error(`${source.name} disallows crawling ${source.url}`);
}

async function fetchSource(source) {
  await assertRobotsAllowed(source);
  const response = await fetch(source.url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  return source.parse(await response.text(), source);
}

function mergeEvents({ manual, fetched, existing, now, limit = 80, horizonDays = 180 }) {
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

export async function runIngestion(sources) {
  const now = new Date();
  const results = await Promise.allSettled(sources.map(async (source) => ({ source, events: await fetchSource(source) })));
  const successful = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failures = results.filter((result) => result.status === 'rejected');
  if (!successful.length) throw new AggregateError(failures.map((result) => result.reason), 'All event sources failed');
  for (const result of failures) console.error(`Source failed: ${result.reason?.message || result.reason}`);

  const rawFetched = successful.flatMap(({ events }) => events);
  const tradeOnly = rawFetched.filter((event) => !isPubliclyAccessible(event));
  const fetchedTriage = filterAndDedupeActivities(rawFetched.filter(isPubliclyAccessible));
  const manual = JSON.parse(await readFile(MANUAL, 'utf8')).events;
  const existing = JSON.parse(await readFile(OUTPUT, 'utf8')).events;
  const existingTriage = filterAndDedupeActivities(existing.filter(isPubliclyAccessible));
  const events = mergeEvents({ manual, fetched: fetchedTriage.activities, existing: existingTriage.activities, now });

  const tokyoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T') + '+09:00';
  const updatedAtLabel = `今日 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
  const review = [
    ...tradeOnly.map((activity) => ({ activity, decision: 'review', reasons: ['Tokyo Big Sight: trade-only admission'] })),
    ...fetchedTriage.review,
  ];
  const sourceStatus = sources.map((source, index) => ({ name: source.name, ok: results[index].status === 'fulfilled', count: results[index].status === 'fulfilled' ? results[index].value.events.length : 0, error: results[index].status === 'rejected' ? String(results[index].reason?.message || results[index].reason) : undefined }));
  await Promise.all([
    writeFile(OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, updatedAtLabel, sourceStatus, events }, null, 2)}\n`),
    writeFile(REVIEW_OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, sourceStatus, events: review }, null, 2)}\n`),
  ]);
  console.log(`Updated ${events.length} events from ${successful.length}/${sources.length} sources. Excluded ${fetchedTriage.excluded.length + existingTriage.excluded.length}; review ${review.length}.`);
}
