#!/usr/bin/env node
/**
 * Run the automatic gate over everything still pending.
 *
 * Separate from the crawl on purpose: the crawl fills the pool and must not be
 * able to publish or reject anything. This step is where rules rule, and it
 * prints what it did so the decisions are never silent.
 */
import { fileURLToPath } from 'node:url';
import { applyGate } from '../lib/gate.mjs';
import { decide, listCandidates, openPool, poolSummary } from '../lib/pool-db.mjs';

const pool = openPool(fileURLToPath(new URL('../data/pool.db', import.meta.url)));
const pending = listCandidates(pool, { state: 'pending' });
const decisions = applyGate(pending);

for (const decision of decisions) {
  decide(pool, decision.id, { state: decision.state, decidedBy: decision.decidedBy, reason: decision.reason });
}

const byRule = {};
for (const decision of decisions) byRule[decision.decidedBy] = (byRule[decision.decidedBy] || 0) + 1;
const summary = poolSummary(pool);
pool.close();

console.log(`Gate ruled on ${decisions.length} of ${pending.length} pending candidates.`);
for (const [rule, count] of Object.entries(byRule)) console.log(`  ${rule}: ${count}`);
console.log(`Pool: ${summary.pending} pending · ${summary.published} published · ${summary.rejected} rejected.`);
