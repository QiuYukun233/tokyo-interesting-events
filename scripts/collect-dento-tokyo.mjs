import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { DENTO_TOKYO_ORIGIN, FACILITIES_URL, parseFacilities } from './sources/dento-tokyo.mjs';

/**
 * Collect 東京都産業労働局's 「伝統工芸品にふれる公共施設」 as places.
 *
 * Small and stable: nine ward-run craft museums and craft cafés that no venue
 * calendar or fair roster reaches. One request.
 *
 *   node scripts/collect-dento-tokyo.mjs
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

await assertRobotsAllowed({ name: '東京の伝統工芸品', origin: DENTO_TOKYO_ORIGIN, url: FACILITIES_URL }, fetch);

const response = await fetch(FACILITIES_URL, { headers: { 'user-agent': USER_AGENT } });
if (!response.ok) {
  console.error(`${FACILITIES_URL} returned ${response.status}. Nothing collected.`);
  process.exit(1);
}

const source = {
  name: '東京の伝統工芸品',
  startDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()),
};
const events = parseFacilities(await response.text(), source);
if (!events.length) {
  // The page is a fixed list; parsing none of it means the markup changed.
  console.error('The facilities page loaded but no facility parsed. Nothing collected.');
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const event of events) upsertCandidate(pool, event, { now, ...classifyActivity(event) });
pool.close();

console.log(`Pooled ${events.length} craft facilities as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
