import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { INFRA_TOURISM_URL, parseInfraTourism } from './sources/infra-tourism.mjs';

/**
 * Collect Tokyo infrastructure-tour programmes (地下調節池, バスタ新宿, 羽田
 * T3 backyard…) from the MLIT インフラツーリズム portal as places. See
 * scripts/sources/infra-tourism.mjs.
 *
 *   node scripts/collect-infra-tourism.mjs
 *
 * Occasional rather than daily: the portal is a curated registry that gains
 * a handful of entries a year, and every entry is a standing programme.
 * Writes only through upsertCandidate() (决策记录 0004).
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);
const SOURCE = { name: 'インフラツーリズム（国交省）', origin: 'https://www.mlit.go.jp', url: INFRA_TOURISM_URL };

await assertRobotsAllowed(SOURCE, fetch);

const response = await fetch(SOURCE.url, { headers: { 'user-agent': USER_AGENT } });
if (!response.ok) throw new Error(`${SOURCE.url} returned ${response.status}`);
const html = await response.text();

const startDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const places = parseInfraTourism(html, { ...SOURCE, startDate });
if (!places.length) {
  console.error('Fetched the page but parsed no Tokyo tours. The list markup may have changed.');
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const place of places) upsertCandidate(pool, { sourceFamily: 'infra_tourism', ...place }, { now, ...classifyActivity(place) });
pool.close();

console.log(`Pooled ${places.length} Tokyo infrastructure tours as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
