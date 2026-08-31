/**
 * Explore-queue engine. Pure functions only: no database, no network — the
 * cloud API (计划二) feeds it candidates and votes and gets a round back.
 * Mirrors lib/ranking.mjs's philosophy: weights come from observation, never
 * hand-tuning (0002), and are bounded so no single factor can dominate.
 */
const MIN_VOTES_PER_TAG = 5;
const DAY = 86400000;

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

/**
 * Hard filter for one candidate (docs/探索队列设计.md §3).
 * `votesById` maps candidateId → latest {vote, votedAt}.
 */
export function eligibleForRound(candidate, votesById = new Map(), { now, horizonDays = 180, cooldownDays = 30 } = {}) {
  if (candidate.state === 'rejected') return false;
  const today = new Date(now ?? Date.now());
  const start = new Date(`${candidate.startDate}T00:00:00+09:00`);
  // No endDate means "ends the day it starts" — through 23:59, not at 00:00,
  // or a single-day event would vanish from the queue on its own morning.
  const end = new Date(`${candidate.endDate ?? candidate.startDate}T23:59:59+09:00`);
  if (!candidate.ongoing && end < today) return false;
  if (start > new Date(today.getTime() + horizonDays * DAY)) return false;
  const voted = votesById.get(candidate.id);
  if (!voted) return true;
  if (voted.vote === 'want' || voted.vote === 'no') return false;
  return new Date(voted.votedAt) <= new Date(today.getTime() - cooldownDays * DAY);
}

/**
 * Build one round (docs/探索队列设计.md §3).
 *
 * Composition for size S: ~S/3 nowness (closing or starting within 14 days),
 * ~S/3 by total score (base score + learned tag bonus), the rest by
 * family round-robin, with 1-2 exploration slots for tags nobody has voted
 * on yet. Deterministic — no randomness, so it is fully testable; variety
 * comes from votes changing between rounds.
 *
 * Candidates must arrive with a `score` (计划二 computes it with
 * lib/ranking.mjs's scoreFor) and their `tags`.
 */
export function buildRound(candidates = [], {
  now, size = 15, tag = null, votesById = new Map(), tagWeights = new Map(),
} = {}) {
  const today = new Date(now ?? Date.now());
  let eligible = candidates.filter((c) => eligibleForRound(c, votesById, { now: today }));
  if (tag) eligible = eligible.filter((c) => (c.tags ?? []).includes(tag));

  const total = (c) => (c.score ?? 0) + tagScore(c, tagWeights);
  const byTotal = [...eligible].sort((a, b) => total(b) - total(a) || String(a.id).localeCompare(String(b.id)));

  const picked = [];
  const taken = new Set();
  const take = (candidate, reason) => {
    if (!candidate || taken.has(candidate.id) || picked.length >= size) return;
    taken.add(candidate.id);
    picked.push({ ...candidate, pickedFor: reason });
  };

  // 1. Nowness: closing, or starting within two weeks. Closings first —
  // a deadline is the one thing that cannot wait (same rule as scoreFor).
  const soon = new Date(today.getTime() + 14 * DAY);
  const nowness = byTotal.filter((c) => c.changeType === 'closing'
    || (new Date(`${c.startDate}T00:00:00+09:00`) <= soon && !c.ongoing))
    .sort((a, b) => (b.changeType === 'closing' ? 1 : 0) - (a.changeType === 'closing' ? 1 : 0));
  for (const c of nowness.slice(0, Math.ceil(size / 3))) take(c, 'nowness');

  // 2. Top total score.
  for (const c of byTotal) {
    if (picked.length >= Math.ceil((2 * size) / 3)) break;
    take(c, 'score');
  }

  // 3. Family round-robin over what is left, breadth before depth.
  const byFamily = new Map();
  for (const c of byTotal) {
    if (taken.has(c.id)) continue;
    const family = c.sourceFamily ?? c.source ?? '';
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(c);
  }
  const explorationSlots = size >= 10 ? 2 : 1;
  while (picked.length < size - explorationSlots) {
    let took = false;
    for (const queue of byFamily.values()) {
      if (picked.length >= size - explorationSlots) break;
      const next = queue.shift();
      if (next) { take(next, 'diversity'); took = true; }
    }
    if (!took) break;
  }

  // 4. Exploration: tags with no vote history yet — the weights' only way in.
  const votedTags = new Set();
  for (const c of candidates) {
    if (votesById.has(c.id)) for (const t of c.tags ?? []) votedTags.add(t);
  }
  const unexplored = byTotal.filter((c) => !taken.has(c.id)
    && (c.tags ?? []).some((t) => !votedTags.has(t)));
  for (const c of unexplored.slice(0, explorationSlots)) take(c, 'exploration');

  // Backfill if any bucket ran short.
  for (const c of byTotal) { if (picked.length >= size) break; take(c, 'score'); }
  return picked;
}
