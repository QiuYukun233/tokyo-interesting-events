/**
 * Editorial labels: what a human thinks of a candidate, kept apart from what
 * the pipeline did with it.
 *
 * A label is NOT a publish action. The automatic gate does not exist yet, and
 * a hand-worked approval queue was ruled out — at ~40 candidates a day it would
 * drown whoever holds it. So labelling here has one purpose: measure how well
 * each existing rule agrees with human judgement, so the gate can be designed
 * against real numbers.
 *
 * The payload is `agreementByReason()`. A reason code whose candidates humans
 * mostly like is a bad filter; one whose candidates humans mostly reject is a
 * good filter and a gate can trust it. Precision is reported with its own
 * sample size, because a code seen four times says nothing yet.
 *
 * Pure functions over plain data.
 */

export const VERDICTS = ['good', 'bad', 'unsure'];

/** Below this many labels a per-reason rate is noise, not evidence. */
export const MIN_SAMPLE = 10;

export const emptyLabels = () => ({ version: 1, labels: {} });

export function upsertLabel(store, id, { verdict, note = '', at }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`unknown verdict: ${verdict}`);
  if (!id) throw new Error('a label needs a candidate id');
  return { ...store, labels: { ...store.labels, [id]: { verdict, note, labeledAt: at } } };
}

export function removeLabel(store, id) {
  const labels = { ...store.labels };
  delete labels[id];
  return { ...store, labels };
}

/**
 * Flatten the pipeline's outputs into one candidate list.
 *
 * `published` and `review` overlap on purpose: today every review item is also
 * published, and hiding that would misrepresent what the reader actually sees.
 */
export function collectCandidates({ published = [], review = [] }) {
  const byId = new Map();
  for (const activity of published) {
    if (activity?.id) byId.set(activity.id, { activity, decision: 'keep', reasons: [], signals: [], published: true });
  }
  for (const item of review) {
    const activity = item.activity || item;
    if (!activity?.id) continue;
    const existing = byId.get(activity.id);
    byId.set(activity.id, {
      activity,
      decision: item.decision || 'review',
      reasons: item.reasons || [],
      signals: item.signals || [],
      published: Boolean(existing?.published),
    });
  }
  return [...byId.values()];
}

export const attachLabels = (candidates, store) =>
  candidates.map((candidate) => ({ ...candidate, label: store.labels?.[candidate.activity.id] || null }));

/** How much of the queue has been judged, overall and per pipeline decision. */
export function coverage(labelled) {
  const byDecision = {};
  for (const { decision, label } of labelled) {
    byDecision[decision] ??= { total: 0, labelled: 0 };
    byDecision[decision].total += 1;
    if (label) byDecision[decision].labelled += 1;
  }
  return { total: labelled.length, labelled: labelled.filter(({ label }) => label).length, byDecision };
}

/**
 * Per reason code: of the candidates that fired this rule and have been judged,
 * how many did a human actually want?
 *
 * `goodRate` high  → the rule is flagging things people want; as a filter it is wrong.
 * `goodRate` low   → the rule is catching things people reject; a gate can lean on it.
 * `enoughSamples`  → false means do not conclude anything yet.
 */
export function agreementByReason(labelled) {
  const byCode = new Map();
  for (const { reasons, signals, label } of labelled) {
    if (!label || label.verdict === 'unsure') continue;
    for (const code of new Set([...(reasons || []), ...(signals || [])])) {
      const bucket = byCode.get(code) || { code, labelled: 0, good: 0, bad: 0 };
      bucket.labelled += 1;
      bucket[label.verdict === 'good' ? 'good' : 'bad'] += 1;
      byCode.set(code, bucket);
    }
  }
  return [...byCode.values()]
    .map((bucket) => ({ ...bucket, goodRate: bucket.labelled ? bucket.good / bucket.labelled : 0, enoughSamples: bucket.labelled >= MIN_SAMPLE }))
    .sort((a, b) => b.labelled - a.labelled);
}

/** Same question, per source: which feeds carry things people want? */
export function agreementBySource(labelled) {
  const bySource = new Map();
  for (const { activity, label } of labelled) {
    if (!label || label.verdict === 'unsure') continue;
    const name = activity.source || '(未标注来源)';
    const bucket = bySource.get(name) || { source: name, labelled: 0, good: 0, bad: 0 };
    bucket.labelled += 1;
    bucket[label.verdict === 'good' ? 'good' : 'bad'] += 1;
    bySource.set(name, bucket);
  }
  return [...bySource.values()]
    .map((bucket) => ({ ...bucket, goodRate: bucket.labelled ? bucket.good / bucket.labelled : 0, enoughSamples: bucket.labelled >= MIN_SAMPLE }))
    .sort((a, b) => b.labelled - a.labelled);
}

/**
 * What the current keep/review split would score if it were switched on as a gate.
 *
 * Only labelled candidates count. `missedGood` is the cost the user was worried
 * about: things a human wanted that the rules would have withheld.
 */
export function gateProjection(labelled) {
  const judged = labelled.filter(({ label }) => label && label.verdict !== 'unsure');
  const wouldPublish = judged.filter(({ decision }) => decision === 'keep');
  const wouldWithhold = judged.filter(({ decision }) => decision !== 'keep');
  const good = ({ label }) => label.verdict === 'good';
  return {
    judged: judged.length,
    wouldPublish: wouldPublish.length,
    wouldWithhold: wouldWithhold.length,
    // Of what the gate would let through, how much is actually wanted.
    precision: wouldPublish.length ? wouldPublish.filter(good).length / wouldPublish.length : null,
    // Of everything wanted, how much the gate would let through.
    recall: judged.filter(good).length ? wouldPublish.filter(good).length / judged.filter(good).length : null,
    missedGood: wouldWithhold.filter(good).length,
    correctlyWithheld: wouldWithhold.filter((item) => !good(item)).length,
  };
}
