import test from 'node:test';
import assert from 'node:assert/strict';
import { tagWeightsFromVotes, eligibleForRound } from './queue.mjs';

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
