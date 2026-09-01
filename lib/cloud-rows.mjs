/**
 * Turns the hydrated local pool into what push-cloud sends (设计 §2.6):
 * score is computed HERE, from human decisions the cloud will never see —
 * weightsFromEvidence(agreementByReason(...)) then scoreFor per row. Never
 * rankCandidates: it stamps displayTags and duplicates round-robin logic.
 * Pure function; the script owns all I/O.
 */
import { agreementByReason } from './gate-evidence.mjs';
import { weightsFromEvidence, scoreFor } from './ranking.mjs';
import { CANDIDATE_COLUMNS } from './cloud-db.mjs';

// Derived from the mirror's column list so the two can never drift: score is
// computed below, pushedAt is stamped by upsertCloudCandidates, tags needs an
// array default rather than null.
const CLOUD_FIELDS = CANDIDATE_COLUMNS.filter((c) => c !== 'score' && c !== 'pushedAt' && c !== 'tags');

export function splitForCloud(candidates = [], { now } = {}) {
  const weights = weightsFromEvidence(agreementByReason(candidates));
  const pushRows = [];
  const deleteIds = [];
  for (const candidate of candidates) {
    if (candidate.state === 'rejected') {
      deleteIds.push(candidate.id);
      continue;
    }
    const row = {};
    for (const field of CLOUD_FIELDS) row[field] = candidate[field] ?? null;
    row.tags = candidate.tags ?? [];
    row.score = scoreFor(candidate, weights, { now });
    pushRows.push(row);
  }
  return { pushRows, deleteIds };
}
