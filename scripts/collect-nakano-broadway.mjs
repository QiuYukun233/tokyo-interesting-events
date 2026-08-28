import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { CATEGORIES_URL, NAKANO_BROADWAY_ORIGIN, buildTaxonomy, mapBuilding, postsUrl } from './sources/nakano-broadway.mjs';

/**
 * Collect 中野ブロードウェイ's tenants as places.
 *
 * A building, not an event, and **one candidate, not 207**: for deciding where
 * to go, every shop in it is the same destination. The tenant list becomes the
 * card's description. Four requests — one taxonomy, three pages of posts. See
 * scripts/sources/nakano-broadway.mjs.
 *
 *   node scripts/collect-nakano-broadway.mjs
 *
 * Occasional rather than daily: tenants change over months, not hours.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);
const MAX_PAGES = 10;

const get = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

await assertRobotsAllowed({ name: '中野ブロードウェイ', origin: NAKANO_BROADWAY_ORIGIN, url: `${NAKANO_BROADWAY_ORIGIN}/floor/` }, fetch);

const taxonomy = buildTaxonomy(await get(CATEGORIES_URL));
if (!Object.keys(taxonomy.floors).length) {
  // Without the floor taxonomy every post would be dropped as "not a tenant",
  // which would look like an empty building rather than a broken read.
  console.error('No floor categories found; the taxonomy names must have changed. Nothing collected.');
  process.exit(1);
}

const posts = [];
for (let page = 1; page <= MAX_PAGES; page += 1) {
  const batch = await get(postsUrl(page)).catch(() => []);
  if (!batch.length) break;
  posts.push(...batch);
}

const building = mapBuilding(posts, taxonomy, {
  name: '中野ブロードウェイ',
  startDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()),
});
if (!building) {
  console.error(`${posts.length} posts but no tenants parsed. Nothing collected.`);
  process.exit(1);
}
console.log(`${posts.length} posts → ${building.description}`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
upsertCandidate(pool, building, { now, ...classifyActivity(building) });
pool.close();

console.log('Pooled the building as one place candidate.');
console.log('Run `npm run export-site` to refresh what the site shows.');
