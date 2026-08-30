import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { parseMdmsMania } from './sources/mdms-mania.mjs';

/**
 * Collect Tokyo murder-mystery (マーダーミステリー) shops from マダミスマニア
 * (mdms-mania.com) as places. See scripts/sources/mdms-mania.mjs.
 *
 *   node scripts/collect-mdms-mania.mjs
 *
 * Occasional rather than daily: this is a hand-written directory article,
 * not a dated event feed — new shops open on the order of months, not hours.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);
const SOURCE = { name: 'マダミスマニア', origin: 'https://mdms-mania.com', url: 'https://mdms-mania.com/store/tokyo/' };

await assertRobotsAllowed(SOURCE, fetch);

const response = await fetch(SOURCE.url, { headers: { 'user-agent': USER_AGENT } });
if (!response.ok) throw new Error(`${SOURCE.url} returned ${response.status}`);
const html = await response.text();

const startDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const shops = parseMdmsMania(html, { ...SOURCE, startDate });
if (!shops.length) {
  console.error('Fetched the page but parsed no Tokyo shops. The article structure may have changed.');
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const shop of shops) upsertCandidate(pool, shop, { now, ...classifyActivity(shop) });
pool.close();

console.log(`Pooled ${shops.length} Tokyo murder-mystery shops as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
