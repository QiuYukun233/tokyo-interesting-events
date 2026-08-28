import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { MINERAL_SHOW_ORIGIN, MINERAL_SHOW_PAGES, isInPrefecture, mapShop, pageApiUrl, parseMineralShowPage } from './sources/tokyo-mineral-show.mjs';

/**
 * Collect the 東京ミネラルショー exhibitor directory **as shops**, not as events.
 *
 * The fair's roster doubles as a directory of mineral, fossil and meteorite
 * dealers with published street addresses. Those shops keep trading after the
 * fair, so these are recorded as `place` candidates with no dependence on the
 * fair's date — see scripts/sources/tokyo-mineral-show.mjs.
 *
 *   node scripts/collect-mineral-shops.mjs
 *   node scripts/collect-mineral-shops.mjs --prefecture 神奈川県
 *
 * Ten requests. Occasional rather than daily: the directory is rewritten once
 * per edition, and shops do not move weekly.
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);
const YEAR_MS = 365 * 86400000;

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const prefecture = readArg('prefecture', '東京都');
await assertRobotsAllowed({ name: '東京ミネラルショー', origin: MINERAL_SHOW_ORIGIN, url: `${MINERAL_SHOW_ORIGIN}/exhibitor/` }, fetch);

const now = new Date();
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
// See the doc comment in the source module: the pool has no "ongoing, no known
// end" concept, so a place needs a far endDate to stay inside the horizon
// filter until a later run refreshes it.
const horizon = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now.getTime() + YEAR_MS));

const shops = [];
for (const page of MINERAL_SHOW_PAGES) {
  const response = await fetch(pageApiUrl(page.slug), { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) { console.warn(`${page.slug} returned ${response.status}; skipped`); continue; }
  const payload = await response.json();
  if (!payload.length) { console.warn(`${page.slug} has no page; skipped`); continue; }
  const parsed = parseMineralShowPage(payload[0].content.rendered, page);
  // あ行 is republished as an HTML comment while an edition is being prepared,
  // so an empty page here is "not published yet", not a broken parser.
  if (!parsed.length) console.warn(`${page.slug} (${page.label}) parsed 0 rows — probably 制作中`);
  for (const shop of parsed) shops.push({ ...shop, link: payload[0].link });
}

const kept = shops.filter((shop) => isInPrefecture(shop.address, prefecture));
console.log(`${shops.length} directory rows, ${shops.filter((shop) => shop.address).length} with an address, ${kept.length} in ${prefecture}.`);

const pool = openPool(fileURLToPath(POOL));
let stored = 0;
for (const [index, shop] of kept.entries()) {
  const event = mapShop(shop, {
    name: readArg('name', '東京ミネラルショー'),
    link: shop.link,
    startDate: today,
    endDate: horizon,
  }, index);
  if (!event) continue;
  upsertCandidate(pool, event, { now, ...classifyActivity(event) });
  stored += 1;
}
pool.close();

console.log(`Pooled ${stored} shops as place candidates.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
