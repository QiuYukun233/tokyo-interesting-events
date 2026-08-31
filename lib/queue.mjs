/**
 * Explore-queue engine. Pure functions only: no database, no network — the
 * cloud API (计划二) feeds it candidates and votes and gets a round back.
 * Mirrors lib/ranking.mjs's philosophy: weights come from observation, never
 * hand-tuning (0002), and are bounded so no single factor can dominate.
 */
const MIN_VOTES_PER_TAG = 5;

/**
 * Per-tag taste weights from vote history.
 *
 * @param {Array<{tags: string[], vote: 'want'|'ok'|'no'}>} votes
 *   one entry per voted candidate, carrying that candidate's tags
 * @returns {Map<string, number>} tag → weight in [-0.5, +0.5]
 */
export function tagWeightsFromVotes(votes = [], { minVotes = MIN_VOTES_PER_TAG } = {}) {
  const counts = new Map();
  let want = 0;
  for (const { tags = [], vote } of votes) {
    if (vote === 'want') want += 1;
    for (const tag of new Set(tags)) {
      const entry = counts.get(tag) ?? { want: 0, total: 0 };
      entry.total += 1;
      if (vote === 'want') entry.want += 1;
      counts.set(tag, entry);
    }
  }
  const base = votes.length ? want / votes.length : 0;
  const weights = new Map();
  for (const [tag, { want: w, total }] of counts) {
    if (total < minVotes) continue;
    const delta = w / total - base;
    weights.set(tag, Number(Math.max(-0.5, Math.min(0.5, delta)).toFixed(4)));
  }
  return weights;
}

/** Taste bonus for one candidate: the sum of its tags' learned weights. */
export function tagScore(candidate = {}, weights = new Map()) {
  let score = 0;
  for (const tag of new Set(candidate.tags ?? [])) score += weights.get(tag) ?? 0;
  return Number(score.toFixed(4));
}
