import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { openPool, listCandidates } from '../lib/pool-db.mjs';
import { splitForCloud } from '../lib/cloud-rows.mjs';
import { ensureCloudSchema, upsertCloudCandidates, deleteCloudCandidates } from '../lib/cloud-db.mjs';

/**
 * One-way sync: pool.db → Turso mirror (docs/探索队列设计.md §2). Idempotent —
 * re-running pushes the same rows again; nothing ever flows back. Hard-excluded
 * candidates are DELETED from the mirror so they can never enter a round.
 *
 *   node scripts/push-cloud.mjs             # push
 *   node scripts/push-cloud.mjs --dry-run   # report counts, touch nothing
 */
const dryRun = process.argv.includes('--dry-run');
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required');
  process.exit(1);
}

const pool = openPool(fileURLToPath(new URL('../data/pool.db', import.meta.url)));
const { pushRows, deleteIds } = splitForCloud(listCandidates(pool));
console.log(`${pushRows.length} candidates to push, ${deleteIds.length} hard-excluded to delete`);
if (dryRun) process.exit(0);

const client = createClient({ url, authToken });
await ensureCloudSchema(client);
await upsertCloudCandidates(client, pushRows);
await deleteCloudCandidates(client, deleteIds);
console.log('push-cloud done');
client.close();
