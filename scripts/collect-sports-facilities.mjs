import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { readCsvRecords } from '../lib/csv.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { CKAN_SEARCH_URL, mapFacilities, selectDatasets } from './sources/sports-facilities.mjs';

/**
 * Collect public sports facilities that offer something unusual, from the
 * wards' own open data via the 東京都 CKAN catalogue.
 *
 * See scripts/sources/sports-facilities.mjs. Roughly 65 requests: one catalogue
 * query and one CSV per ward. Occasional rather than daily — a ward republishes
 * this file a few times a year, and a 弓道場 does not move.
 *
 *   node scripts/collect-sports-facilities.mjs
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

const get = (url) => fetch(url, { headers: { 'user-agent': USER_AGENT } });

const catalogue = await get(CKAN_SEARCH_URL);
if (!catalogue.ok) {
  console.error(`CKAN search returned ${catalogue.status}. Nothing collected.`);
  process.exit(1);
}
const datasets = selectDatasets(await catalogue.json());
console.log(`${datasets.length} sports-facility datasets in the catalogue.`);

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const events = [];
let unreadable = 0;
for (const dataset of datasets) {
  let records;
  try {
    const response = await get(dataset.url);
    // A dead link in the catalogue skips that ward; it must not abort the run.
    if (!response.ok) { unreadable += 1; continue; }
    ({ records } = readCsvRecords(new Uint8Array(await response.arrayBuffer())));
  } catch (error) {
    console.warn(`${dataset.org}: ${error.message}`);
    unreadable += 1;
    continue;
  }
  const mapped = mapFacilities(records, {
    name: `${dataset.org} スポーツ施設`,
    org: dataset.org,
    datasetUrl: dataset.url,
    startDate: today,
  });
  if (mapped.length) console.log(`  ${String(mapped.length).padStart(3)} / ${String(records.length).padStart(4)}  ${dataset.org}`);
  events.push(...mapped);
}

console.log(`\n${events.length} walk-in leisure facilities kept (${unreadable} datasets unreadable).`);
if (!events.length) {
  console.error('Nothing collected.');
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const event of events) upsertCandidate(pool, event, { now, ...classifyActivity(event) });
pool.close();

console.log(`Pooled ${events.length} leisure facilities as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
