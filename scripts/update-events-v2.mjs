import { readFile, writeFile } from 'node:fs/promises';
import robotsParser from 'robots-parser';
import { filterAndDedupeActivities } from '../lib/activity-filter.mjs';
import { mergeAndSelectEvents } from './lib/event-utils.mjs';
import { SOURCES } from './sources/index.mjs';

const ROOT = new URL('../', import.meta.url);
const OUTPUT = new URL('data/events.json', ROOT);
const MANUAL = new URL('data/manual-events.json', ROOT);
const USER_AGENT = 'TokyoInterestingEvents/0.2 (+contact via repository)';

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

async function main() {
  const now = new Date();
  const fetched = (await Promise.all(SOURCES.map(fetchSource))).flat();
  const manual = JSON.parse(await readFile(MANUAL, 'utf8')).events;
  const existing = JSON.parse(await readFile(OUTPUT, 'utf8')).events;
  const fetchedTriage = filterAndDedupeActivities(fetched);
  const existingTriage = filterAndDedupeActivities(existing);
  const events = mergeAndSelectEvents({ manual, fetched: fetchedTriage.activities, existing: existingTriage.activities, now });
  const tokyoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T') + '+09:00';
  const updatedAtLabel = `今日 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
  await writeFile(OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, updatedAtLabel, events }, null, 2)}\n`);
  console.log(`Updated ${events.length} events from ${SOURCES.length} source(s). Excluded ${fetchedTriage.excluded.length + existingTriage.excluded.length}; review ${fetchedTriage.review.length + existingTriage.review.length}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
