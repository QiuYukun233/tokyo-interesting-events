import { fileURLToPath } from 'node:url';
import { listCandidates, openPool } from '../lib/pool-db.mjs';

/**
 * Withdraw every decision made by one author, returning those candidates to
 * pending.
 *
 * 决策记录/0005 constraint 3: **a machine's judgement must be reproducible and
 * therefore disposable.** When a rule changes, a prompt changes or a model is
 * swapped, its past decisions have to come off in one command — otherwise the
 * pool silently accumulates rulings nobody can account for.
 *
 * The asymmetry is the point: a person's judgement cannot be regenerated, so
 * this refuses to touch `human` unless asked twice. Everything else — `rule:*`,
 * `ai:*`, `legacy` — is reproducible by re-running whatever produced it.
 *
 *   node scripts/undecide-batch.mjs --by ai:haiku-4.5          # dry run
 *   node scripts/undecide-batch.mjs --by ai:haiku-4.5 --write
 *   node scripts/undecide-batch.mjs --by rule:not_a_destination --write
 */
const POOL = new URL('../data/pool.db', import.meta.url);

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const by = readArg('by');
const write = process.argv.includes('--write');
if (!by) {
  console.error('usage: node scripts/undecide-batch.mjs --by <decidedBy> [--write]');
  console.error('  e.g. --by ai:haiku-4.5   --by rule:not_open_to_public');
  process.exit(1);
}
if (by === 'human' && !process.argv.includes('--yes-really-drop-human-decisions')) {
  console.error('Refusing to drop human decisions: they cannot be regenerated (决策记录/0005).');
  console.error('Pass --yes-really-drop-human-decisions if that is genuinely what you want.');
  process.exit(1);
}

const pool = openPool(fileURLToPath(POOL));
const affected = listCandidates(pool).filter((candidate) => candidate.decidedBy === by);
const byState = affected.reduce((counts, candidate) => ({ ...counts, [candidate.state]: (counts[candidate.state] ?? 0) + 1 }), {});

console.log(`${affected.length} decisions by ${by}${affected.length ? ` (${Object.entries(byState).map(([state, count]) => `${state} ${count}`).join(', ')})` : ''}.`);
for (const candidate of affected.slice(0, 5)) console.log(`  ${candidate.state.padEnd(9)} ${candidate.title.slice(0, 50)}`);
if (affected.length > 5) console.log(`  …and ${affected.length - 5} more`);

if (!write) {
  console.log('\nDry run. Pass --write to return these candidates to pending.');
} else {
  const removed = pool.prepare('DELETE FROM decisions WHERE decidedBy = ?').run(by).changes;
  console.log(`\nWithdrew ${removed} decisions; those candidates are pending again.`);
  console.log('Run `npm run export-site` to refresh what the site shows.');
}
pool.close();
