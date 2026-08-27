/**
 * Evidence for building the automatic gate.
 *
 * This replaces the separate labelling store. Once publication became a real
 * decision recorded in the pool, a second "what does a human think of this"
 * vocabulary was redundant: promoting a candidate already says the human wants
 * it, rejecting already says they do not. One action, both purposes.
 *
 * The payload is `agreementByReason()`. For each reason code the filter
 * attached, it reports how often a human then published the candidate anyway:
 *
 *   publishRate high → the code is flagging things people want. As a gate rule
 *                      it would be wrong.
 *   publishRate low  → the code catches what people reject. A gate can lean on it.
 *
 * Rates come with their sample size because a code seen four times says nothing.
 *
 * Pure functions over pool rows.
 */

/** Below this many decisions a per-code rate is noise, not evidence. */
export const MIN_SAMPLE = 10;

/** Only decided candidates count; pending ones carry no information yet. */
const decided = (candidates) => candidates.filter((row) => row.state === 'published' || row.state === 'rejected');

function rate(bucket) {
  return { ...bucket, publishRate: bucket.decided ? bucket.published / bucket.decided : 0, enoughSamples: bucket.decided >= MIN_SAMPLE };
}

/** How much of the pool has been ruled on, overall and per object type. */
export function coverage(candidates = []) {
  const byType = {};
  for (const row of candidates) {
    byType[row.objectType] ??= { total: 0, decided: 0, published: 0 };
    byType[row.objectType].total += 1;
    if (row.state !== 'pending') byType[row.objectType].decided += 1;
    if (row.state === 'published') byType[row.objectType].published += 1;
  }
  return {
    total: candidates.length,
    decided: decided(candidates).length,
    pending: candidates.filter((row) => row.state === 'pending').length,
    byType,
  };
}

/** Per reason/signal code: of the decided candidates carrying it, how many were published. */
export function agreementByReason(candidates = []) {
  const byCode = new Map();
  for (const row of decided(candidates)) {
    for (const code of new Set([...(row.reasons || []), ...(row.signals || [])])) {
      const bucket = byCode.get(code) || { code, decided: 0, published: 0, rejected: 0 };
      bucket.decided += 1;
      bucket[row.state] += 1;
      byCode.set(code, bucket);
    }
  }
  return [...byCode.values()].map(rate).sort((a, b) => b.decided - a.decided);
}

/** Same question per source: which feeds carry things people actually want? */
export function agreementBySource(candidates = []) {
  const bySource = new Map();
  for (const row of decided(candidates)) {
    const source = row.source || '(编辑精选)';
    const bucket = bySource.get(source) || { source, decided: 0, published: 0, rejected: 0 };
    bucket.decided += 1;
    bucket[row.state] += 1;
    bySource.set(source, bucket);
  }
  return [...bySource.values()].map(rate).sort((a, b) => b.decided - a.decided);
}

/** And per object type, which is what a type-aware gate would need. */
export function agreementByObjectType(candidates = []) {
  const byType = new Map();
  for (const row of decided(candidates)) {
    const bucket = byType.get(row.objectType) || { objectType: row.objectType, decided: 0, published: 0, rejected: 0 };
    bucket.decided += 1;
    bucket[row.state] += 1;
    byType.set(row.objectType, bucket);
  }
  return [...byType.values()].map(rate).sort((a, b) => b.decided - a.decided);
}

/**
 * What the crawl-time filter would score if its keep/review split were wired up
 * as the gate, measured against the decisions actually made.
 *
 * `missedGood` is the cost that matters: things a human published that the
 * filter would have withheld.
 */
export function gateProjection(candidates = []) {
  const judged = decided(candidates);
  // The filter routed anything with a review/hard code away from publication.
  const wouldWithhold = judged.filter((row) => (row.reasons || []).some((code) => code.startsWith('review:') || code.startsWith('hard:')));
  const wouldPublish = judged.filter((row) => !wouldWithhold.includes(row));
  const wanted = judged.filter((row) => row.state === 'published');
  return {
    judged: judged.length,
    wouldPublish: wouldPublish.length,
    wouldWithhold: wouldWithhold.length,
    precision: wouldPublish.length ? wouldPublish.filter((row) => row.state === 'published').length / wouldPublish.length : null,
    recall: wanted.length ? wouldPublish.filter((row) => row.state === 'published').length / wanted.length : null,
    missedGood: wouldWithhold.filter((row) => row.state === 'published').length,
    correctlyWithheld: wouldWithhold.filter((row) => row.state === 'rejected').length,
  };
}
