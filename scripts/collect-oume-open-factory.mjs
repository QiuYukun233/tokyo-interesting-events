import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { OUME_URL, parseOumeFactories } from './sources/oume-open-factory.mjs';

/**
 * Collect おうめオープンファクトリー's workshops as places.
 *
 * One request: the whole roster is a single page. See
 * scripts/sources/oume-open-factory.mjs.
 *
 *   node scripts/collect-oume-open-factory.mjs
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

await assertRobotsAllowed({ name: 'おうめオープンファクトリー', origin: 'https://www.omecci.jp', url: OUME_URL }, fetch);

const response = await fetch(OUME_URL, { headers: { 'user-agent': USER_AGENT } });
if (!response.ok) {
  console.error(`${OUME_URL} returned ${response.status}. Nothing collected.`);
  process.exit(1);
}

const html = await response.text();
// The roster page is reused edition to edition; the label comes from the page
// itself so a candidate is never attributed to the wrong year.
const edition = readArg('name', (html.match(/おうめオープンファクトリー\s*(20\d{2})/) || [])[0] || 'おうめオープンファクトリー');
const source = {
  name: edition.replace(/\s+/g, ''),
  startDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()),
};

const events = parseOumeFactories(html, source);
if (!events.length) {
  // The page exists year-round and is emptied between editions; an empty parse
  // is "the roster is not up yet", not success. 决策记录/0004.
  console.error(`${source.name}: the page loaded but lists no factories. Nothing collected.`);
  process.exit(1);
}
console.log(`${source.name}: ${events.length} factories with an address.`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const event of events) upsertCandidate(pool, event, { now, ...classifyActivity(event) });
pool.close();

console.log(`Pooled ${events.length} workshops as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
