import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { listCandidates, openPool } from '../lib/pool-db.mjs';

/**
 * Recompute reason/signal codes for candidates already in the pool.
 *
 * Codes are computed at upsert time and stored, so adding a rule to
 * lib/activity-filter.mjs leaves every existing candidate labelled by the old
 * rule set. Sources that run daily fix themselves on the next crawl; the
 * manual `collect-*` sources would stay stale until someone re-ran them, which
 * for a fair whose roster is only up for a few weeks a year could be never.
 *
 * This only rewrites `reasons`/`signals` on the `candidates` table. It does not
 * touch `decisions` — a re-labelled candidate keeps whatever ruling it had
 * (决策记录/0003), and it writes nothing else, so it cannot change what is
 * published.
 *
 *   node scripts/backfill-signals.mjs           # report what would change
 *   node scripts/backfill-signals.mjs --write   # apply
 */
const POOL = new URL('../data/pool.db', import.meta.url);
const write = process.argv.includes('--write');

const pool = openPool(fileURLToPath(POOL));
const update = pool.prepare('UPDATE candidates SET reasons = ?, signals = ? WHERE id = ?');

let changed = 0;
const added = new Map();
for (const candidate of listCandidates(pool)) {
  const { reasons, signals } = classifyActivity(candidate);
  const before = JSON.stringify([candidate.reasons, candidate.signals]);
  const after = JSON.stringify([reasons, signals]);
  if (before === after) continue;
  changed += 1;
  for (const code of signals) {
    if (!candidate.signals.includes(code)) added.set(code, (added.get(code) || 0) + 1);
  }
  if (write) update.run(JSON.stringify(reasons), JSON.stringify(signals), candidate.id);
}
pool.close();

console.log(`${changed} candidates would change (${write ? 'written' : 'dry run — pass --write to apply'}).`);
for (const [code, count] of [...added].sort((a, b) => b[1] - a[1])) console.log(`  +${count}  ${code}`);
