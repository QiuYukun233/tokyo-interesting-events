import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { MAKER_FAIRE_ORIGIN, discoverMakerSlugs, fetchMaker } from './sources/maker-faire-tokyo.mjs';

/**
 * Manual/occasional collector for Maker Faire Tokyo — see the doc comment in
 * scripts/sources/maker-faire-tokyo.mjs for why this fair's exhibitor
 * directory is not in scripts/sources/index.mjs's daily SOURCES.
 *
 * Run once the exhibitor directory is populated (typically a few weeks before
 * the fair):
 *   node scripts/collect-maker-faire-tokyo.mjs --start 2026-09-05 --end 2026-09-06 \
 *     --venue "有明GYM-EX（ジメックス）" --name "Maker Faire Tokyo 2026"
 *
 * One run costs roughly (kana-index pages) + (exhibitor count) requests —
 * around 300 for the 2026 edition.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const startDate = readArg('start', '2026-09-05');
const endDate = readArg('end', '2026-09-06');
const venue = readArg('venue', '有明GYM-EX（ジメックス）');
const edition = readArg('name', 'Maker Faire Tokyo 2026');
const source = { name: edition, startDate, endDate, venue, origin: MAKER_FAIRE_ORIGIN, url: MAKER_FAIRE_ORIGIN };

await assertRobotsAllowed(source, fetch);
const fetchWithUa = (url) => fetch(url, { headers: { 'user-agent': USER_AGENT } });

console.log('Discovering exhibitor slugs across the kana index...');
const slugs = await discoverMakerSlugs(fetchWithUa);
console.log(`Found ${slugs.length} exhibitors. Fetching each detail page...`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
let stored = 0;
let skipped = 0;
for (const [index, slug] of slugs.entries()) {
  const event = await fetchMaker(slug, source, fetchWithUa);
  if (!event) { skipped += 1; continue; }
  upsertCandidate(pool, event, { now, ...classifyActivity(event) });
  stored += 1;
  if ((index + 1) % 50 === 0) console.log(`  ...${index + 1}/${slugs.length}`);
}
pool.close();

console.log(`Pooled ${stored} candidates from ${edition} (${skipped} exhibitor pages skipped: missing name).`);
console.log('Run `npm run export-site` to refresh what the site shows.');
