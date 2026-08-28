import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { OOTA_ORIGIN, editionPostsUrl, parseFactory } from './sources/oota-open-factory.mjs';

/**
 * Collect おおたオープンファクトリー's open workshops as places.
 *
 * The fair is one day a year; the 町工場 in 大田区 are there the rest of it, so
 * these land as `place` candidates with `ongoing: true`. See
 * scripts/sources/oota-open-factory.mjs.
 *
 *   node scripts/collect-oota-open-factory.mjs             # newest populated edition
 *   node scripts/collect-oota-open-factory.mjs --year 2025
 *
 * About thirty requests: one to enumerate, one per workshop.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const get = (url) => fetch(url, { headers: { 'user-agent': USER_AGENT } });
const now = new Date();
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
const thisYear = Number(today.slice(0, 4));

/**
 * Walk back until an edition actually lists workshops. A future edition's site
 * exists as a teaser months before its roster is filled in, and answers 200
 * with an empty array — collecting that silently would look like success.
 */
async function newestPopulatedEdition(years) {
  for (const year of years) {
    const response = await get(editionPostsUrl(year));
    if (!response.ok) { console.warn(`oof${year}: REST returned ${response.status}`); continue; }
    const posts = await response.json();
    if (Array.isArray(posts) && posts.length) return { year, posts };
    console.warn(`oof${year}: site is up but lists 0 workshops (still a teaser); trying the previous edition`);
  }
  return null;
}

await assertRobotsAllowed({ name: 'おおたオープンファクトリー', origin: OOTA_ORIGIN, url: `${OOTA_ORIGIN}/mono/` }, fetch);

const requested = readArg('year');
const edition = await newestPopulatedEdition(requested ? [Number(requested)] : [thisYear, thisYear - 1, thisYear - 2]);
if (!edition) {
  console.error('No おおたオープンファクトリー edition with a populated workshop list. Nothing collected.');
  process.exit(1);
}

const source = { name: `おおたオープンファクトリー${edition.year}`, year: edition.year, startDate: today };
console.log(`${source.name}: ${edition.posts.length} workshops listed. Fetching detail pages...`);

const pool = openPool(fileURLToPath(POOL));
let stored = 0;
let skipped = 0;
for (const post of edition.posts) {
  const response = await get(post.link);
  if (!response.ok) { skipped += 1; continue; }
  const event = parseFactory(await response.text(), source, post.link);
  if (!event) { skipped += 1; continue; }
  upsertCandidate(pool, event, { now, ...classifyActivity(event) });
  stored += 1;
}
pool.close();

console.log(`Pooled ${stored} workshops as place candidates (${skipped} skipped: no name or no address).`);
console.log('Run `npm run export-site` to refresh what the site shows.');
