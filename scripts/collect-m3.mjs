import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { M3_API, M3_VENUE, activeExhibition, eventDateToJst, mapCircles } from './sources/m3.mjs';

/**
 * Manual/occasional collector for M3（音系・メディアミックス同人即売会）.
 *
 * See scripts/sources/m3.mjs for why the edition has to be resolved at run
 * time rather than pinned in the daily registry. Run it after an edition's
 * catalogue opens (M3 is twice a year, spring and autumn):
 *   node scripts/collect-m3.mjs                 # whichever edition is active
 *   node scripts/collect-m3.mjs --edition 2026s # a specific one
 *
 * Three requests total, whatever the size of the catalogue.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

await assertRobotsAllowed({ name: 'M3', origin: M3_API, url: `${M3_API}/exhibitions` }, fetch);
const getJson = async (path) => {
  const response = await fetch(`${M3_API}${path}`, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`M3 API ${path} returned ${response.status}`);
  return response.json();
};

const requested = readArg('edition');
const exhibitions = await getJson('/exhibitions');
const items = exhibitions?.items ?? exhibitions ?? [];
const edition = requested
  ? items.find((item) => item.id === requested)
  : activeExhibition(exhibitions);
if (!edition) {
  console.error(`unknown --edition ${requested}; known: ${items.map((item) => item.id).join(', ')}`);
  process.exit(1);
}

const detail = await getJson(`/exhibitions/${edition.id}`);
const startDate = eventDateToJst(detail.eventDate);
if (!startDate) {
  console.error(`${edition.name} has no eventDate yet; the catalogue is not ready. Nothing collected.`);
  process.exit(1);
}

const source = { name: edition.name, edition: edition.id, startDate, venue: readArg('venue', M3_VENUE) };
console.log(`${edition.name} (${edition.id}) — ${startDate} @ ${source.venue}`);

// Between editions the API keeps flagging the last fair as active, so a plain
// run months later would load ~1,700 candidates that already happened. They
// could never be published, and they would enlarge the review backlog that is
// already known issue #1. Refuse by default and say why; --allow-past is there
// for deliberately backfilling an old edition.
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
if (startDate < today && !process.argv.includes('--allow-past')) {
  console.error(`${edition.name} was held on ${startDate}, before today (${today}).`);
  console.error('The next edition\'s catalogue is probably not open yet. Nothing collected.');
  console.error('Pass --allow-past to backfill this edition anyway.');
  process.exit(1);
}

const events = mapCircles(await getJson(`/circles/${edition.id}`), source);
console.log(`Mapped ${events.length} circles.`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
let stored = 0;
for (const event of events) {
  upsertCandidate(pool, event, { now, ...classifyActivity(event) });
  stored += 1;
}
pool.close();

console.log(`Pooled ${stored} candidates from ${edition.name}.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
