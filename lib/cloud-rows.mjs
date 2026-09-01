/**
 * Turns the hydrated local pool into what push-cloud sends (设计 §2.6):
 * score is computed HERE, from human decisions the cloud will never see —
 * weightsFromEvidence(agreementByReason(...)) then scoreFor per row. Never
 * rankCandidates: it stamps displayTags and duplicates round-robin logic.
 * Pure function; the script owns all I/O.
 */
import { agreementByReason } from './gate-evidence.mjs';
import { weightsFromEvidence, scoreFor } from './ranking.mjs';

const CLOUD_FIELDS = ['id', 'title', 'titleZh', 'place', 'time', 'price', 'startDate', 'endDate',
  'ongoing', 'sourceUrl', 'source', 'sourceFamily', 'changeType', 'popularity', 'description', 'tags'];

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
