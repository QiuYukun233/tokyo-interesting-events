#!/usr/bin/env node
/**
 * One-off: build the pool from the JSON files that preceded it.
 *
 * The cut is deliberate. Everything that was already on the front page before
 * the source expansion of 2026-08-28 is grandfathered in as published, so the
 * site does not go blank and nobody has to re-approve work that was already
 * live. Everything the expansion added lands pending, in the back office —
 * which is exactly the instruction: 新增的先分门别类放进后台.
 *
 * `decidedBy: 'legacy'` marks the grandfathered set so it can be told apart
 * from anything a human or a rule actually ruled on.
 *
 * Safe to re-run: decisions are upserted by candidate id, and a candidate that
 * already carries a human decision is left alone.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide, getCandidate, openPool, poolSummary, upsertCandidate } from '../lib/pool-db.mjs';

const ROOT = new URL('../', import.meta.url);
const POOL = new URL('data/pool.db', ROOT);

/** The last commit before the source expansion; its events.json is the baseline. */
const BASELINE_COMMIT = 'a3fda77';

const now = new Date();
const pool = openPool(fileURLToPath(POOL));

const current = JSON.parse(await readFile(new URL('data/events.json', ROOT), 'utf8')).events;
const manual = JSON.parse(await readFile(new URL('data/manual-events.json', ROOT), 'utf8')).events;

let baseline = [];
try {
  const raw = execFileSync('git', ['show', `${BASELINE_COMMIT}:data/events.json`], { cwd: fileURLToPath(ROOT), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  baseline = JSON.parse(raw).events;
} catch (error) {
  console.error(`Could not read the baseline at ${BASELINE_COMMIT}: ${error.message}`);
  console.error('Seeding everything as pending instead — review the back office before exporting.');
}
// Match on sourceUrl+title rather than id: ids changed when Big Sight moved to
// open data and started linking to organisers instead of the venue calendar.
const grandfathered = new Set(baseline.map((event) => `${event.sourceUrl}:${event.title}`));

let seeded = 0;
let published = 0;
let kept = 0;
for (const event of [...current, ...manual]) {
  if (!event?.id || !event?.startDate) continue;
  upsertCandidate(pool, event, { now });
  seeded += 1;

  const existing = getCandidate(pool, event.id);
  if (existing?.state !== 'pending') { kept += 1; continue; }
  // Editorial picks are already a human decision by definition.
  const isManual = manual.some((item) => item.id === event.id);
  if (isManual || grandfathered.has(`${event.sourceUrl}:${event.title}`)) {
    decide(pool, event.id, { state: 'published', decidedBy: 'legacy', reason: isManual ? '编辑精选' : '扩源前已在前台', now });
    published += 1;
  }
}

const summary = poolSummary(pool);
pool.close();
console.log(`Seeded ${seeded} candidates; grandfathered ${published} as published; left ${kept} existing decisions alone.`);
console.log(`Pool: ${summary.pending} pending · ${summary.published} published · ${summary.rejected} rejected.`);
