import test from 'node:test';
import assert from 'node:assert/strict';
import { tagWeightsFromVotes, eligibleForRound, buildRound } from './queue.mjs';

const vote = (tags, kind) => ({ tags, vote: kind });
const NOW = new Date('2026-08-31T00:00:00+09:00');
const cand = (overrides = {}) => ({
  id: 'x', state: 'pending', startDate: '2026-09-10', endDate: null,
  ongoing: false, tags: [], ...overrides,
});

test('a tag mostly wanted gets a positive weight, mostly refused negative', () => {
  const votes = [
    ...Array.from({ length: 6 }, () => vote(['深夜'], 'want')),
    ...Array.from({ length: 2 }, () => vote(['深夜'], 'no')),
    ...Array.from({ length: 6 }, () => vote(['亲子'], 'no')),
    ...Array.from({ length: 2 }, () => vote(['亲子'], 'want')),
  ];
  const weights = tagWeightsFromVotes(votes);
  assert.ok(weights.get('深夜') > 0);
  assert.ok(weights.get('亲子') < 0);
});

test('a tag with too few votes carries no weight at all', () => {
  // Same rule as weightsFromEvidence: a first impression is not evidence.
  const weights = tagWeightsFromVotes([vote(['怪奇'], 'want')]);
  assert.equal(weights.get('怪奇'), undefined);
});

test('weights are bounded to ±0.5 so one tag cannot dominate the score', () => {
  const votes = Array.from({ length: 50 }, () => vote(['铁道'], 'want'));
  const weights = tagWeightsFromVotes(votes);
  assert.ok(Math.abs(weights.get('铁道')) <= 0.5);
});

test('rejected, ended, and beyond-horizon candidates never enter a round', () => {
  assert.equal(eligibleForRound(cand(), new Map(), { now: NOW }), true);
  assert.equal(eligibleForRound(cand({ state: 'rejected' }), new Map(), { now: NOW }), false);
  assert.equal(eligibleForRound(cand({ startDate: '2026-08-01', endDate: '2026-08-20' }), new Map(), { now: NOW }), false);
  assert.equal(eligibleForRound(cand({ startDate: '2027-06-01' }), new Map(), { now: NOW }), false);
  assert.equal(eligibleForRound(cand({ startDate: '2026-08-01', ongoing: true }), new Map(), { now: NOW }), true);
});

test('a single-day event stays eligible through its own day, not just at midnight', () => {
  // No endDate means "ends the day it starts" — the whole day, not 00:00:00.
  const afternoon = new Date('2026-08-31T15:00:00+09:00');
  assert.equal(eligibleForRound(cand({ startDate: '2026-08-31' }), new Map(), { now: afternoon }), true);
  assert.equal(eligibleForRound(cand({ startDate: '2026-08-30' }), new Map(), { now: afternoon }), false);
});

test('want and no are final; ok cools down for 30 days then returns', () => {
  const at = (days) => ({ votedAt: new Date(NOW.getTime() - days * 86400000).toISOString() });
  assert.equal(eligibleForRound(cand(), new Map([['x', { vote: 'want', ...at(99) }]]), { now: NOW }), false);
  assert.equal(eligibleForRound(cand(), new Map([['x', { vote: 'no', ...at(99) }]]), { now: NOW }), false);
  assert.equal(eligibleForRound(cand(), new Map([['x', { vote: 'ok', ...at(10) }]]), { now: NOW }), false);
  assert.equal(eligibleForRound(cand(), new Map([['x', { vote: 'ok', ...at(31) }]]), { now: NOW }), true);
});

const pool20 = (families) => families.flatMap((family) =>
  Array.from({ length: 20 }, (_, i) => cand({
    id: `${family}-${i}`, sourceFamily: family, score: (20 - i) / 20,
    startDate: '2026-09-10', tags: [],
  })));

test('a round is the requested size with no duplicates', () => {
  const round = buildRound(pool20(['a', 'b', 'c']), { now: NOW, size: 15 });
  assert.equal(round.length, 15);
  assert.equal(new Set(round.map((c) => c.id)).size, 15);
});

test('no family may exceed a third of the round, even with the biggest pool and best scores', () => {
  // The real failure this pins: CoRich (stage plays) outnumbers every other
  // family and outscores them on evidence, so it swallowed the nowness AND
  // score buckets. The cap holds no matter how lopsided the pool is.
  const pool = [...pool20(['theater', 'craft', 'market']),
    ...Array.from({ length: 60 }, (_, i) => cand({ id: `t-extra-${i}`, sourceFamily: 'theater', score: 5 + i }))];
  const round = buildRound(pool, { now: NOW, size: 15 });
  const byFamily = {};
  for (const c of round) byFamily[c.sourceFamily] = (byFamily[c.sourceFamily] || 0) + 1;
  for (const n of Object.values(byFamily)) assert.ok(n <= Math.ceil(15 / 3), JSON.stringify(byFamily));
  assert.equal(round.length, 15, 'the cap redistributes, it does not shrink the round');
});

test('subscribed tags fill most of the round, round-robin across tags, with a soft other-third', () => {
  const pool = [
    // Big, high-scoring unsubscribed mass (the stage-play problem in miniature).
    ...Array.from({ length: 30 }, (_, i) => cand({ id: `play-${i}`, sourceFamily: `pf-${i}`, score: 2 + i, tags: ['演剧'] })),
    ...Array.from({ length: 8 }, (_, i) => cand({ id: `night-${i}`, sourceFamily: `nf-${i}`, score: 0.1, tags: ['深夜'] })),
    ...Array.from({ length: 8 }, (_, i) => cand({ id: `weird-${i}`, sourceFamily: `wf-${i}`, score: 0.1, tags: ['怪奇'] })),
  ];
  const round = buildRound(pool, { now: NOW, size: 15, subscribedTags: ['深夜', '怪奇'] });
  assert.equal(round.length, 15);
  const subscribed = round.filter((c) => c.tags.some((t) => ['深夜', '怪奇'].includes(t)));
  const others = round.filter((c) => !c.tags.some((t) => ['深夜', '怪奇'].includes(t)));
  assert.ok(subscribed.length >= 9, `subscribed should dominate, got ${subscribed.length}`);
  assert.ok(others.length >= 2, `soft mix-in must survive, got ${others.length}`);
  // Round-robin: neither subscribed tag drowns the other.
  const nights = round.filter((c) => c.tags.includes('深夜')).length;
  const weirds = round.filter((c) => c.tags.includes('怪奇')).length;
  assert.ok(Math.abs(nights - weirds) <= 2, `深夜 ${nights} vs 怪奇 ${weirds}`);
});

test('with no subscriptions the round works as before', () => {
  const round = buildRound(pool20(['a', 'b', 'c']), { now: NOW, size: 15, subscribedTags: [] });
  assert.equal(round.length, 15);
});

test('subscribed picks are labeled, and a subscribed closing keeps its nowness label', () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => cand({ id: `night-${i}`, sourceFamily: `nf-${i}`, score: 0.1, tags: ['深夜'] })),
    cand({ id: 'closing-night', sourceFamily: 'cf', score: 0, changeType: 'closing', tags: ['深夜'] }),
    ...Array.from({ length: 10 }, (_, i) => cand({ id: `other-${i}`, sourceFamily: `of-${i}`, score: 1, tags: ['演剧'] })),
  ];
  const round = buildRound(pool, { now: NOW, size: 12, subscribedTags: ['深夜'] });
  assert.ok(round.some((c) => c.pickedFor === 'subscribed'));
  const closing = round.find((c) => c.id === 'closing-night');
  assert.ok(closing, 'a closing inside the subscription must make the round');
  assert.equal(closing.pickedFor, 'nowness');
});

test('a closing candidate outranks its equals into the round', () => {
  const pool = [...pool20(['a']), cand({ id: 'closing', sourceFamily: 'a', score: 0, changeType: 'closing' })];
  const round = buildRound(pool, { now: NOW, size: 15 });
  assert.ok(round.some((c) => c.id === 'closing'));
});

test('a tag filter narrows the round to that tag only', () => {
  const pool = [
    ...pool20(['a']),
    cand({ id: 'night-1', sourceFamily: 'b', score: 0.1, tags: ['深夜'] }),
    cand({ id: 'night-2', sourceFamily: 'b', score: 0.2, tags: ['深夜'] }),
  ];
  const round = buildRound(pool, { now: NOW, size: 15, tag: '深夜' });
  assert.deepEqual(round.map((c) => c.id).sort(), ['night-1', 'night-2']);
});

test('voted candidates are excluded and tag weights reorder the rest', () => {
  const votesById = new Map([['a-0', { vote: 'no', votedAt: NOW.toISOString() }]]);
  const weights = new Map([['怪奇', 0.5]]);
  // 'weird' sits in its own family: the family cap would (correctly) block a
  // 21st candidate of family a, and that is not what this test is about.
  const pool = [...pool20(['a']), cand({ id: 'weird', sourceFamily: 'b', score: 0.05, tags: ['怪奇'] })];
  const round = buildRound(pool, { now: NOW, size: 10, votesById, tagWeights: weights });
  assert.ok(!round.some((c) => c.id === 'a-0'));
  assert.ok(round.some((c) => c.id === 'weird'), 'the learned tag lifts a low-score candidate in');
});

test('each pick says why it was picked', () => {
  const round = buildRound(pool20(['a', 'b']), { now: NOW, size: 12 });
  for (const c of round) assert.ok(['nowness', 'score', 'diversity', 'exploration', 'subscribed'].includes(c.pickedFor), c.pickedFor);
});
