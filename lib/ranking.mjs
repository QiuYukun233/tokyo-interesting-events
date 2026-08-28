/**
 * Ordering and tagging — the third thing a rule can do.
 *
 * `lib/gate.mjs` rules decide, and their bar is deliberately high: an
 * organiser's declared fact, never taste (决策记录/0002). Running the evidence
 * on 2026-08-29 showed why that bar leaves almost everything unruled — of the
 * seven codes with enough decided samples, **not one publishes at a rate near
 * 0 or 1**:
 *
 *   signal:theater      63%      signal:tech         55%
 *   signal:in_building  48%      signal:hands_on     42%
 *   no_public_signal    35%      signal:art          25%
 *   signal:off_street   21%
 *
 * A code at 25% is not a rule — rejecting on it would throw away one good
 * candidate in four. But it is real information, and a backlog of 2,600
 * pending candidates shown in date order wastes it entirely.
 *
 * So this module does what a gate cannot: it **orders and labels** without
 * deciding anything. Nothing here writes to `decisions`, and nothing here can
 * publish or reject. It only changes what a person sees first.
 *
 * Pure functions; no I/O, no clock of its own.
 */

/**
 * How much a code moves a candidate up or down the queue.
 *
 * Derived from the observed publish rate rather than hand-tuned: a code that
 * humans published 63% of the time should outrank one they published 25% of
 * the time. `lib/gate-evidence.mjs` computes those rates from real decisions,
 * so this stays honest as the sample grows.
 */
export function weightsFromEvidence(agreements = [], { minimumSamples = 10 } = {}) {
  const weights = new Map();
  for (const { code, publishRate, decided } of agreements) {
    if (decided < minimumSamples) continue;
    // Centre on 0: above the midpoint lifts, below it sinks.
    weights.set(code, Number((publishRate - 0.5).toFixed(4)));
  }
  return weights;
}

/**
 * The unit a person actually decides about.
 *
 * 708 stalls at one craft fair, or 220 comedy bills at one theatre, are not 708
 * and 220 separate questions — see 方案 §4.3. Grouping by source and venue lets
 * the queue show one of each cluster before showing the second of any, so a
 * reviewer sees the whole breadth of the pool first instead of one fair.
 */
export function clusterKey(candidate = {}) {
  const venue = String(candidate.place ?? '')
    .split('·')[0]                                        // 「会場 · ブースA-05」
    .replace(/\s*(地下)?[０-９0-9]+\s*(F|階).*$/, '')       // 「…ビル 3F」
    .trim();
  return `${candidate.source ?? ''}@${venue}`;
}

/**
 * Descriptive tags for a card. These are labels, not judgements: each one is
 * either a fact the source stated or a shape of the address.
 */
export function tagsFor(candidate = {}) {
  const tags = [];
  const signals = candidate.signals ?? [];
  if (signals.includes('signal:residential_room')) tags.push('住宅楼一室');
  else if (signals.includes('signal:off_street')) tags.push('不在街面');
  if (candidate.ongoing) tags.push('常驻');
  if (candidate.changeType === 'closing') tags.push('即将消失');
  if (candidate.changeType === 'opening') tags.push('新开');
  if (candidate.audience && candidate.audience !== '公開') tags.push(candidate.audience);
  return tags;
}

const dayNumber = (value) => {
  const time = Date.parse(`${String(value ?? '').slice(0, 10)}T00:00:00+09:00`);
  return Number.isNaN(time) ? null : Math.floor(time / 86400000);
};

/**
 * Score one candidate. Higher sorts first.
 *
 * Three inputs, and their ranges are chosen so the order of importance holds
 * however the numbers move:
 *
 *   closing        +1        a deadline is the one thing that cannot wait
 *   evidence       ±0.5      per code, from its observed publish rate
 *   soon           ≤0.25     this month over next spring — a tiebreaker only
 *
 * Recency is deliberately the smallest. A candidate whose codes humans have
 * published 90% of the time should outrank a signal-less one starting tomorrow;
 * if imminence could outweigh evidence, the queue would just be a calendar.
 */
export function scoreFor(candidate = {}, weights = new Map(), { now } = {}) {
  let score = 0;
  for (const code of new Set([...(candidate.reasons ?? []), ...(candidate.signals ?? [])])) {
    score += weights.get(code) ?? 0;
  }
  if (candidate.changeType === 'closing') score += 1;

  const start = dayNumber(candidate.startDate);
  const today = dayNumber(now ? new Date(now).toISOString() : new Date().toISOString());
  if (start !== null && today !== null) {
    const daysAway = start - today;
    // Already running counts as imminent; further out decays to nothing over
    // the pool's 180-day horizon.
    score += daysAway <= 0 ? 0.15 : Math.max(0, 0.25 - daysAway / 720);
  }
  return Number(score.toFixed(4));
}

/**
 * Order candidates for review: best first, but **round-robin over sources and
 * venues** so no single one can fill the screen.
 *
 * One axis is not enough, and both failures were seen on the real pool:
 *
 *   - By date alone, 708 stalls of one craft fair run consecutively.
 *   - Round-robin over venue only, and CoRich takes over instead: each of its
 *     363 shows is at a different theatre, so every one is its own cluster and
 *     they all tie at rank 1.
 *
 * So a candidate's place in the queue is its rank **within its source** first,
 * then within its venue. Round one is the best candidate from each source,
 * round two the second from each, and so on — a reviewer sees the breadth of
 * the pool before the depth of any part of it.
 *
 * `clusterRank`/`clusterSize` are kept on each row so a caller can collapse a
 * cluster's tail ("and 707 more stalls at this fair").
 */
export function rankCandidates(candidates = [], { weights = new Map(), now } = {}) {
  const scored = candidates.map((candidate) => ({
    ...candidate,
    tags: tagsFor(candidate),
    cluster: clusterKey(candidate),
    score: scoreFor(candidate, weights, { now }),
  })).sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));

  const clusterSeen = new Map();
  const sourceSeen = new Map();
  for (const candidate of scored) {
    const source = candidate.source ?? '';
    candidate.clusterRank = (clusterSeen.get(candidate.cluster) ?? 0) + 1;
    clusterSeen.set(candidate.cluster, candidate.clusterRank);
    candidate.sourceRank = (sourceSeen.get(source) ?? 0) + 1;
    sourceSeen.set(source, candidate.sourceRank);
  }
  for (const candidate of scored) candidate.clusterSize = clusterSeen.get(candidate.cluster);

  return [...scored].sort((a, b) => a.sourceRank - b.sourceRank
    || a.clusterRank - b.clusterRank
    || b.score - a.score
    || String(a.id).localeCompare(String(b.id)));
}
