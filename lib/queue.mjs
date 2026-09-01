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
 * Build one round (docs/探索队列设计.md §3, subscriptions added 2026-09-01).
 *
 * With subscriptions: ~2/3 of the round comes from candidates carrying a
 * subscribed tag (nowness within them first, then round-robin ACROSS the
 * subscribed tags so no one tag drowns the others), the rest is the soft
 * mix-in — closings, top score, and exploration from outside the
 * subscription. Without subscriptions: ~S/3 nowness, ~S/3 total score,
 * the rest family round-robin plus 1-2 exploration slots, as before.
 *
 * Either way a hard family cap (ceil(S/3)) bounds every bucket. This exists
 * because the biggest family (stage plays) also carried the best evidence
 * scores and swallowed the nowness AND score buckets whole — diversity
 * cannot be recovered by round-robin over the 3 slots it has left.
 *
 * Deterministic — no randomness, so it is fully testable; variety comes
 * from votes changing between rounds. Candidates must arrive with a `score`
 * (计划二 computes it with lib/ranking.mjs's scoreFor) and their `tags`.
 */
export function buildRound(candidates = [], {
  now, size = 15, tag = null, votesById = new Map(), tagWeights = new Map(),
  subscribedTags = [], horizonDays, cooldownDays, familyCap,
} = {}) {
  const today = new Date(now ?? Date.now());
  let eligible = candidates.filter((c) => eligibleForRound(c, votesById, { now: today, horizonDays, cooldownDays }));
  if (tag) eligible = eligible.filter((c) => (c.tags ?? []).includes(tag));

  const total = (c) => (c.score ?? 0) + tagScore(c, tagWeights);
  const byTotal = [...eligible].sort((a, b) => total(b) - total(a) || String(a.id).localeCompare(String(b.id)));

  const cap = familyCap ?? Math.ceil(size / 3);
  const familyOf = (c) => c.sourceFamily ?? c.source ?? '';
  const familyCount = new Map();
  const picked = [];
  const taken = new Set();
  const take = (candidate, reason) => {
    if (!candidate || taken.has(candidate.id) || picked.length >= size) return false;
    const family = familyOf(candidate);
    if ((familyCount.get(family) ?? 0) >= cap) return false;
    familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
    taken.add(candidate.id);
    picked.push({ ...candidate, pickedFor: reason });
    return true;
  };

  // Closings first within a pool — a deadline is the one thing that cannot
  // wait (same rule as scoreFor).
  const soon = new Date(today.getTime() + 14 * DAY);
  const nownessOf = (pool) => pool.filter((c) => c.changeType === 'closing'
    || (new Date(`${c.startDate}T00:00:00+09:00`) <= soon && !c.ongoing))
    .sort((a, b) => (b.changeType === 'closing' ? 1 : 0) - (a.changeType === 'closing' ? 1 : 0));

  const explorationSlots = size >= 10 ? 2 : 1;
  const subs = new Set(subscribedTags);
  const hasSub = (c) => (c.tags ?? []).some((t) => subs.has(t));

  if (subs.size) {
    const subPool = byTotal.filter(hasSub);
    const target = size - Math.ceil(size / 3); // the soft other-third stays open

    // Round-robin across the subscribed tags so a big subscribed tag cannot
    // drown a small one. Within each tag: closings first (a deadline is the
    // one thing that cannot wait — it keeps its 'nowness' label), then best
    // total score. Nowness is folded into the rotation rather than taken as
    // a separate bucket, or near-term candidates of one tag would eat the
    // whole subscription share by score order.
    const byTag = new Map([...subs].map((t) => [t,
      subPool.filter((c) => (c.tags ?? []).includes(t))
        .sort((a, b) => (b.changeType === 'closing' ? 1 : 0) - (a.changeType === 'closing' ? 1 : 0)),
    ]));
    let advanced = true;
    while (picked.length < target && advanced) {
      advanced = false;
      for (const queue of byTag.values()) {
        if (picked.length >= target) break;
        let next = queue.shift();
        while (next && !take(next, next.changeType === 'closing' ? 'nowness' : 'subscribed')) next = queue.shift();
        if (next) advanced = true;
      }
    }

    // 3. The soft mix-in from outside the subscription: closings, then
    // exploration (see below), then top score via the shared backfill.
    const otherPool = byTotal.filter((c) => !hasSub(c));
    for (const c of nownessOf(otherPool).filter((c) => c.changeType === 'closing').slice(0, 1)) take(c, 'nowness');
  } else {
    // 1. Nowness: closing, or starting within two weeks.
    for (const c of nownessOf(byTotal).slice(0, Math.ceil(size / 3))) take(c, 'nowness');

    // 2. Top total score.
    for (const c of byTotal) {
      if (picked.length >= Math.ceil((2 * size) / 3)) break;
      take(c, 'score');
    }

    // 3. Family round-robin over what is left, breadth before depth.
    const byFamily = new Map();
    for (const c of byTotal) {
      if (taken.has(c.id)) continue;
      const family = familyOf(c);
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push(c);
    }
    let advanced = true;
    while (picked.length < size - explorationSlots && advanced) {
      advanced = false;
      for (const queue of byFamily.values()) {
        if (picked.length >= size - explorationSlots) break;
        let next = queue.shift();
        while (next && !take(next, 'diversity')) next = queue.shift();
        if (next) advanced = true;
      }
    }
  }

  // Exploration: tags with no vote history yet — the weights' only way in.
  const votedTags = new Set();
  for (const c of candidates) {
    if (votesById.has(c.id)) for (const t of c.tags ?? []) votedTags.add(t);
  }
  const unexplored = byTotal.filter((c) => !taken.has(c.id)
    && (c.tags ?? []).some((t) => !votedTags.has(t)));
  let explored = 0;
  for (const c of unexplored) {
    if (explored >= explorationSlots) break;
    if (take(c, 'exploration')) explored += 1;
  }

  // Backfill if any bucket ran short.
  for (const c of byTotal) { if (picked.length >= size) break; take(c, 'score'); }
  return picked;
}
