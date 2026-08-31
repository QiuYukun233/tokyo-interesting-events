import test from 'node:test';
import assert from 'node:assert/strict';
import { tagWeightsFromVotes } from './queue.mjs';

const vote = (tags, kind) => ({ tags, vote: kind });

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
