import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { assertRobotsAllowed } from './lib/run-ingestion.mjs';
import { curlFetch } from './lib/curl-fetch.mjs';
import { BUNFREE_CATALOG, listUrl, parseBunfree, parseEditionMeta } from './sources/bunfree.mjs';

/**
 * Manual/local collector for 文学フリマ東京.
 *
 * **This cannot run in CI.** Its 利用規約 declares that traffic from
 * non-Japanese IPs, anonymous proxies and VPNs is automatically blocked, and
 * GitHub Actions egresses from outside Japan. Run it from a Japanese
 * connection; do not route around that.
 *
 * Requests go through `curl` rather than the platform fetch, because
 * Cloudflare refuses Node's client fingerprint here even with an identical
 * User-Agent and address. See scripts/lib/curl-fetch.mjs — we still send our
 * own honest UA and still obey robots and the site's stated rules.
 *
 *   node scripts/collect-bunfree.mjs --edition tokyo43
 *
 * One request collects the whole fair (~3,200 exhibitors, 1.6MB).
 */
const USER_AGENT = 'TokyoInterestingEvents/0.6 (+contact via repository)';
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const edition = readArg('edition');
if (!edition) {
  console.error('usage: node scripts/collect-bunfree.mjs --edition tokyo43');
  console.error('A future edition redirects to the catalogue home until its list is published.');
  process.exit(1);
}

const url = listUrl(edition);
await assertRobotsAllowed({ name: '文学フリマ', origin: BUNFREE_CATALOG, url }, curlFetch);

// `redirect: 'manual'` matters: an edition whose list is not published yet
// answers 302 to the catalogue home, which would otherwise be followed and
// parsed as an empty fair.
const response = await curlFetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'manual' });
if (response.status >= 300 && response.status < 400) {
  console.error(`${edition} redirects to ${response.redirectUrl || 'the catalogue home'} — its exhibitor list is not published yet.`);
  process.exit(1);
}
if (response.status === 403) {
  console.error('403. A stub User-Agent is refused, and the 利用規約 blocks non-Japanese IPs,');
  console.error('anonymous proxies and VPNs — check which of those applies before retrying.');
  process.exit(1);
}
if (!response.ok) {
  console.error(`${url} returned ${response.status}`);
  process.exit(1);
}

const html = await response.text();
const meta = parseEditionMeta(html);
if (!meta.startDate) {
  console.error(`Could not read a date for ${edition} from the page header; refusing to guess. Nothing collected.`);
  process.exit(1);
}

const source = { ...meta, edition, name: meta.name || edition };
console.log(`${source.name} — ${source.startDate} @ ${source.venue}`);

// Same guard as the M3 collector: a past edition's list is still served, and
// loading it would add thousands of candidates that can never be published to
// an already-large review backlog.
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
if (source.startDate < today && !process.argv.includes('--allow-past')) {
  console.error(`${source.name} was held on ${source.startDate}, before today (${today}). Nothing collected.`);
  console.error('Pass --allow-past to backfill this edition anyway.');
  process.exit(1);
}

const events = parseBunfree(html, source);
console.log(`Parsed ${events.length} exhibitors.`);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
for (const event of events) upsertCandidate(pool, event, { now, ...classifyActivity(event) });
pool.close();

console.log(`Pooled ${events.length} candidates from ${source.name}.`);
console.log('Run `npm run export-site` to refresh what the site shows.');
