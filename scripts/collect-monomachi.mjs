import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { DEFAULT_PREFECTURE, mapShops, monomachiDataUrl } from './sources/monomachi.mjs';

/**
 * Collect モノマチ's participating workshops as shops.
 *
 * The fair is one weekend a year; the workshops in 台東区 are open the rest of
 * it, so these land as `place` candidates with `ongoing: true` rather than as
 * events tied to the fair's dates. See scripts/sources/monomachi.mjs.
 *
 *   node scripts/collect-monomachi.mjs                # newest published edition
 *   node scripts/collect-monomachi.mjs --year 2026
 *
 * One request. Occasional, not daily: the directory is rewritten once a year.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const now = new Date();
const thisYear = Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now).slice(0, 4));
const requested = readArg('year');

/** Fall back a year: the next edition's subdomain does not exist until it opens. */
async function loadEdition(years) {
  for (const year of years) {
    const url = monomachiDataUrl(year);
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (response.ok) return { year, payload: await response.json() };
    console.warn(`${url} returned ${response.status}; trying an earlier edition`);
  }
  return null;
}

await assertRobotsAllowed({ name: 'モノマチ', origin: 'https://monomachi.com', url: 'https://monomachi.com/' }, fetch);

const edition = await loadEdition(requested ? [requested] : [thisYear, thisYear - 1]);
if (!edition) {
  console.error('No モノマチ data file could be fetched. Nothing collected.');
  process.exit(1);
}

const prefecture = readArg('prefecture', DEFAULT_PREFECTURE);
const source = {
  name: `モノマチ${edition.year}`,
  year: edition.year,
  prefecture,
  // The discovery date, as with the other shop sources: what is being recorded
  // is "this workshop exists", not "the fair happened".
  startDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now),
};

const shops = edition.payload?.shops ?? [];
const events = mapShops(edition.payload, source);
console.log(`${source.name}: ${shops.length} directory rows, ${events.length} with an address in ${prefecture}.`);

const pool = openPool(fileURLToPath(POOL));
for (const event of events) upsertCandidate(pool, event, { now, ...classifyActivity(event) });
pool.close();

console.log(`Pooled ${events.length} workshops as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
