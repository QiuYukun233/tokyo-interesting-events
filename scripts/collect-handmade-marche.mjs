import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { HANDMADE_MARCHE_ORIGIN, discoverExhibitorIds, fetchCreator } from './sources/handmade-marche.mjs';

/**
 * Manual/occasional collector for 東京ハンドメイドマルシェ — see the doc
 * comment in scripts/sources/handmade-marche.mjs for why this fair's
 * exhibitor directory is not in scripts/sources/index.mjs's daily SOURCES.
 *
 * Run near a fair edition (spring/autumn), once its directory is populated:
 *   node scripts/collect-handmade-marche.mjs --year 2026 --venue "東京ドームシティ プリズムホール"
 *
 * One run costs roughly (genre count) + (exhibitor count) requests — around
 * 700 for a full edition — which is why this stays a manual trigger rather
 * than joining the daily cron.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const year = Number(readArg('year', new Date().getFullYear()));
const venue = readArg('venue', '東京ドームシティ プリズムホール');
const edition = readArg('name', `東京ハンドメイドマルシェ${year}`);
const source = { name: edition, year, venue, origin: HANDMADE_MARCHE_ORIGIN, url: HANDMADE_MARCHE_ORIGIN };

await assertRobotsAllowed(source, fetch);
const fetchWithUa = (url) => fetch(url, { headers: { 'user-agent': USER_AGENT } });

console.log('Discovering exhibitor ids across genres...');
const exhibitorIds = await discoverExhibitorIds(fetchWithUa);
console.log(`Found ${exhibitorIds.length} exhibitors. Fetching each creator page...`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
let stored = 0;
let skipped = 0;
for (const [index, exhibitorId] of exhibitorIds.entries()) {
  const event = await fetchCreator(exhibitorId, source, fetchWithUa);
  if (!event) { skipped += 1; continue; }
  upsertCandidate(pool, event, { now, ...classifyActivity(event) });
  stored += 1;
  if ((index + 1) % 50 === 0) console.log(`  ...${index + 1}/${exhibitorIds.length}`);
}
pool.close();

console.log(`Pooled ${stored} candidates from ${edition} (${skipped} exhibitor pages skipped: missing name or date).`);
console.log('Run `npm run export-site` to refresh what the site shows.');
