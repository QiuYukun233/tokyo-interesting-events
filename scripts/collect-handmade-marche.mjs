import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { HANDMADE_MARCHE_SITES, discoverExhibitorIds, fetchCreator, mapFair } from './sources/handmade-marche.mjs';

/**
 * Manual/occasional collector for ハンドメイドマルシェ — see the doc comment in
 * scripts/sources/handmade-marche.mjs for why this fair's exhibitor directory
 * is not in scripts/sources/index.mjs's daily SOURCES.
 *
 * Run near a fair edition, once its directory is populated:
 *   node scripts/collect-handmade-marche.mjs --site tokyo --year 2026
 *
 * `--site` picks one of the operator's city sites (see HANDMADE_MARCHE_SITES).
 * Only Tokyo is in scope by default; collecting another city is a deliberate
 * call about how far outside Tokyo this site reaches, so it must be asked for.
 *
 * One run costs (list pages) + (exhibitor count) requests — about 760 for a
 * full Tokyo edition — which is why this stays a manual trigger.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const siteKey = readArg('site', 'tokyo');
const site = HANDMADE_MARCHE_SITES.find((entry) => entry.key === siteKey);
if (!site) {
  console.error(`unknown --site ${siteKey}; known: ${HANDMADE_MARCHE_SITES.map((entry) => entry.key).join(', ')}`);
  process.exit(1);
}

const year = Number(readArg('year', new Date().getFullYear()));
const venue = readArg('venue', site.venue);
const edition = readArg('name', `${siteKey === 'tokyo' ? '東京' : site.key}ハンドメイドマルシェ${year}`);
const source = { name: edition, year, venue, origin: site.origin, url: site.origin };

await assertRobotsAllowed(source, fetch);
const fetchWithUa = (url) => fetch(url, { headers: { 'user-agent': USER_AGENT } });

console.log(`Discovering exhibitors on ${site.origin} ...`);
const { ids: exhibitorIds, total } = await discoverExhibitorIds(fetchWithUa, { origin: site.origin });
// The site publishes its own total; a walk that collected fewer than that is a
// silently truncated run, which is exactly how the genre-filter bug hid.
if (total !== null && exhibitorIds.length !== total) {
  console.warn(`WARNING: collected ${exhibitorIds.length} exhibitor ids but the site reports ${total}.`);
}
console.log(`Found ${exhibitorIds.length} exhibitors${total === null ? '' : ` (site total: ${total})`}. Fetching each creator page...`);

const creators = [];
let skipped = 0;
for (const [index, exhibitorId] of exhibitorIds.entries()) {
  const creator = await fetchCreator(exhibitorId, source, fetchWithUa);
  if (!creator) { skipped += 1; continue; }
  creators.push(creator);
  if ((index + 1) % 100 === 0) console.log(`  ...${index + 1}/${exhibitorIds.length}`);
}

// One fair, one candidate — 方案 §4.3. The roster becomes the card rather than
// several hundred near-identical answers to "where should we go".
const fair = mapFair(creators, source);
if (!fair) {
  console.error(`No creator pages parsed (${skipped} skipped). Nothing collected.`);
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
upsertCandidate(pool, fair, { now, ...classifyActivity(fair) });
pool.close();

console.log(`${creators.length} creators (${skipped} pages skipped) → ${fair.description}`);
console.log(`Pooled ${edition} as one candidate.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
