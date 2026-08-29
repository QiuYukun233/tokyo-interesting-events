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
 * ## Only a person's decisions count
 *
 * A rate is evidence about what **people** want, so only `decidedBy: human`
 * rows are counted. Including machine decisions makes a rule prove itself:
 * on 2026-08-30 `review:trade_only_admission` showed a 0% publish rate over
 * 101 decisions and looked like the strongest gate candidate in the pool —
 * but all 101 were made by `rule:trade_only_admission` itself, and no person
 * had ever judged one. The number was a mirror.
 *
 * The same trap is waiting for 决策记录/0005's model pass: an AI judging
 * thousands of candidates would otherwise flood these rates with its own
 * opinions and then be told it agrees with them.
 *
 * `humanCoverage()` reports how much of the pool a person has actually seen,
 * which is the honest denominator for any of this.
 *
 * Pure functions over pool rows.
 */

/** Below this many decisions a per-code rate is noise, not evidence. */
export const MIN_SAMPLE = 10;

const isDecided = (row) => row.state === 'published' || row.state === 'rejected';

/** Any settled candidate, whoever settled it. Used for coverage, not for rates. */
const decided = (candidates) => candidates.filter(isDecided);

/**
 * Decisions a person made. This is what every rate below is computed over —
 * see "Only a person's decisions count" above.
 */
const judgedByHuman = (candidates) => candidates.filter((row) => isDecided(row) && row.decidedBy === 'human');

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

/**
 * How much of the pool a **person** has actually looked at.
 *
 * `coverage()` counts every settled candidate, machine decisions included, so
 * it answers "how much is left in the queue". This answers the different and
 * more sobering question behind every rate on this page: how big is the
 * evidence base really.
 */
export function humanCoverage(candidates = []) {
  const human = judgedByHuman(candidates);
  const machine = decided(candidates).length - human.length;
  return {
    total: candidates.length,
    judgedByHuman: human.length,
    publishedByHuman: human.filter((row) => row.state === 'published').length,
    settledByMachine: machine,
  };
}

/** Per reason/signal code: of the candidates a person judged, how many they published. */
export function agreementByReason(candidates = []) {
  const byCode = new Map();
  for (const row of judgedByHuman(candidates)) {
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
  for (const row of judgedByHuman(candidates)) {
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
  for (const row of judgedByHuman(candidates)) {
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
  // Scored against a person's decisions only. Measuring the filter against
  // rows the rules themselves settled would be grading its own homework: the
  // rules reject exactly what the filter flagged, so precision and recall
  // would both approach 1 by construction.
  const judged = judgedByHuman(candidates);
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
