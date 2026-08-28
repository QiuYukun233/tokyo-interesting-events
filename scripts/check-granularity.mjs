import { fileURLToPath } from 'node:url';
import { listCandidates, openPool } from '../lib/pool-db.mjs';

/**
 * Report addresses carrying many candidates.
 *
 * The rule this checks: **one address, one candidate.** A building full of
 * shops is one answer to "where should we go", not two hundred — see
 * scripts/sources/nakano-broadway.mjs, which pooled 207 tenants separately
 * before this was understood.
 *
 * It is a report, not a gate: several shops genuinely can share a small
 * building, and only a person can say whether a cluster is one outing or
 * several. It exists so a new source cannot quietly flood the pool the way
 * that one did.
 *
 *   node scripts/check-granularity.mjs [--threshold 5]
 */
const POOL = new URL('../data/pool.db', import.meta.url);
const index = process.argv.indexOf('--threshold');
const threshold = index === -1 ? 5 : Number(process.argv[index + 1]);

/** Strip floor and room suffixes so 「…ビル 3F」 and 「…ビル 4F」 group together. */
const streetAddress = (place = '') => String(place)
  .replace(/\s*(地下)?[０-９0-9]+\s*(F|階).*$/, '')
  .replace(/-\d{3,4}(号室?)?$/, '')
  .trim();

const pool = openPool(fileURLToPath(POOL));
const places = listCandidates(pool, { objectType: 'place' });
pool.close();

const groups = new Map();
for (const candidate of places) {
  const key = streetAddress(candidate.place);
  if (!key) continue;
  groups.set(key, [...(groups.get(key) ?? []), candidate]);
}

const crowded = [...groups].filter(([, rows]) => rows.length >= threshold).sort((a, b) => b[1].length - a[1].length);
console.log(`${places.length} place candidates at ${groups.size} distinct street addresses.`);
if (!crowded.length) {
  console.log(`No address carries ${threshold} or more candidates.`);
} else {
  console.log(`\nAddresses with ${threshold}+ candidates — check whether each is really one destination:`);
  for (const [address, rows] of crowded) {
    console.log(`  ${String(rows.length).padStart(4)}  ${address}`);
    console.log(`        ${[...new Set(rows.map((row) => row.source))].join(', ')}`);
  }
}
