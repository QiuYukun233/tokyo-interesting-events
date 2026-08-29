/**
 * Order the review queue by **what a decision teaches**, not by what is likely
 * to be published.
 *
 * `lib/ranking.mjs` answers "what should a person see first if we want good
 * things on the site". This file answers a different question, and on
 * 2026-08-30 it is the more pressing one: **the bottleneck is the person.**
 * 934 candidates are pending and a human can judge tens, not hundreds, so the
 * queue should spend those few decisions where they buy the most.
 *
 * Measured that day, the pool held 75 distinct code signatures. **39 of them
 * had never been judged at all, covering 337 pending candidates**, while the
 * largest single signature — 283 `place` candidates with no positive signal —
 * rested on three decisions. Judging a 284th candidate from a well-understood
 * group teaches nothing; judging the first of an unseen group teaches a lot.
 *
 * ## What a decision is worth
 *
 * Three factors, multiplied:
 *
 *   uncertainty × reach × freshness
 *
 * - **uncertainty** — how unsettled this kind of candidate is. A group judged
 *   nine times out of ten one way is settled; one at 50/50, or never judged at
 *   all, is not. Peaks where the publish rate is 0.5.
 * - **reach** — how many pending candidates share the signature, so one
 *   decision informs many. Logarithmic: the difference between 1 and 20 matters
 *   far more than between 200 and 283.
 * - **freshness** — a group with zero decisions gets a bonus, because the first
 *   decision in a group is worth more than the fourth.
 *
 * This is deliberately **not** a quality judgement. A candidate can be top of
 * this queue precisely because nobody knows whether its kind is any good.
 *
 * Pure functions; nothing here writes a decision.
 */

/**
 * What makes two candidates "the same kind of question".
 *
 * Object type plus the full set of reason and signal codes. Source is
 * deliberately excluded: 「place with no positive signal」 is the same question
 * whether it came from a mineral fair or a ward's open data, and folding source
 * in would fragment the groups until every one had a sample of one.
 */
export function signatureOf(candidate = {}) {
  const codes = [...new Set([...(candidate.reasons ?? []), ...(candidate.signals ?? [])])].sort();
  return [candidate.objectType ?? 'unknown', ...codes].join('+');
}

/** Tally pending/published/rejected per signature. */
export function groupBySignature(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = signatureOf(candidate);
    const group = groups.get(key) ?? { signature: key, pending: 0, published: 0, rejected: 0 };
    if (candidate.state === 'published') group.published += 1;
    else if (candidate.state === 'rejected') group.rejected += 1;
    else group.pending += 1;
    groups.set(key, group);
  }
  for (const group of groups.values()) group.decided = group.published + group.rejected;
  return groups;
}

/**
 * How unsettled a group is, 0–1.
 *
 * Never judged is maximally uncertain. Otherwise `4p(1-p)` — 1 at a 50/50
 * split, 0 when every decision has gone the same way. A group with one or two
 * decisions is still treated as largely unknown, because a run of two proves
 * very little (决策记录/0002's "a first pass is not evidence", in miniature).
 */
export function uncertainty(group = {}) {
  const decided = group.decided ?? 0;
  if (!decided) return 1;
  const rate = (group.published ?? 0) / decided;
  const spread = 4 * rate * (1 - rate);
  // Blend towards "unknown" while the sample is thin: at 1 decision the group
  // is still mostly unknown, by ~10 it stands on its own.
  const confidence = Math.min(1, decided / 10);
  return spread * confidence + (1 - confidence);
}

/**
 * Value of judging one more candidate of this kind.
 *
 * @param {object} group  a tally from `groupBySignature`
 */
export function groupValue(group = {}) {
  const reach = Math.log2(1 + (group.pending ?? 0));
  const freshness = (group.decided ?? 0) === 0 ? 1.5 : 1;
  return Number((uncertainty(group) * reach * freshness).toFixed(4));
}

/**
 * Order pending candidates so each decision buys as much as possible.
 *
 * Groups are visited in value order, one candidate from each before a second
 * from any — the same round-robin `lib/ranking.mjs` uses, for the same reason:
 * without it a reviewer spends an entire session inside one group and learns
 * one thing.
 *
 * `tiebreak` orders within a group; the default keeps it deterministic, and the
 * review server passes the publish-likelihood score so that, among equally
 * informative candidates, the more promising one is shown.
 */
export function rankByLearningValue(candidates = [], { tiebreak } = {}) {
  const groups = groupBySignature(candidates);
  const pending = candidates.filter((candidate) => (candidate.state ?? 'pending') === 'pending');

  const annotated = pending.map((candidate) => {
    const group = groups.get(signatureOf(candidate));
    return {
      ...candidate,
      signature: group.signature,
      groupPending: group.pending,
      groupDecided: group.decided,
      learningValue: groupValue(group),
    };
  });

  const order = tiebreak ?? ((a, b) => String(a.id).localeCompare(String(b.id)));
  annotated.sort((a, b) => b.learningValue - a.learningValue || order(a, b));

  const seen = new Map();
  for (const candidate of annotated) {
    const round = (seen.get(candidate.signature) ?? 0) + 1;
    seen.set(candidate.signature, round);
    candidate.groupRound = round;
  }
  return [...annotated].sort((a, b) => a.groupRound - b.groupRound
    || b.learningValue - a.learningValue
    || order(a, b));
}
