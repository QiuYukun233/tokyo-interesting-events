import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SAMPLE, agreementByObjectType, agreementByReason, agreementBySource, coverage, gateProjection } from './gate-evidence.mjs';

const row = (state, extra = {}) => ({
  id: Math.random().toString(36).slice(2), state, objectType: 'event', source: 'My TOKYO',
  reasons: [], signals: [], ...extra,
});

test('pending candidates carry no information and are excluded everywhere', () => {
  const pool = [row('pending', { reasons: ['review:no_public_experience_signal'] })];
  assert.deepEqual(agreementByReason(pool), []);
  assert.deepEqual(agreementBySource(pool), []);
  assert.equal(gateProjection(pool).judged, 0);
});

test('a code whose candidates people publish anyway is reported as a bad rule', () => {
  const code = 'review:no_public_experience_signal';
  const pool = [
    ...Array.from({ length: 9 }, () => row('published', { reasons: [code] })),
    ...Array.from({ length: 3 }, () => row('rejected', { reasons: [code] })),
  ];
  const [entry] = agreementByReason(pool);
  assert.equal(entry.code, code);
  assert.equal(entry.decided, 12);
  assert.equal(entry.published, 9);
  assert.equal(entry.publishRate, 0.75);
  assert.equal(entry.enoughSamples, true);
});

test('a thinly sampled code is flagged as not yet conclusive', () => {
  const pool = Array.from({ length: MIN_SAMPLE - 1 }, () => row('rejected', { reasons: ['hard:recruiting'] }));
  assert.equal(agreementByReason(pool)[0].enoughSamples, false);
});

test('signals and reasons are both counted, without double counting a shared code', () => {
  const pool = [row('published', { reasons: ['signal:tech'], signals: ['signal:tech'] })];
  const entry = agreementByReason(pool)[0];
  assert.equal(entry.decided, 1);
});

test('agreement is reported per source and per object type', () => {
  const pool = [
    row('published', { source: 'Tokyo Big Sight', objectType: 'event' }),
    row('rejected', { source: 'Tokyo Big Sight', objectType: 'event' }),
    row('published', { source: '渋谷PARCO', objectType: 'exhibition' }),
  ];
  assert.equal(agreementBySource(pool).find((entry) => entry.source === 'Tokyo Big Sight').publishRate, 0.5);
  assert.equal(agreementByObjectType(pool).find((entry) => entry.objectType === 'exhibition').publishRate, 1);
});

test('coverage separates decided from pending, per type', () => {
  const result = coverage([
    row('published', { objectType: 'activity' }),
    row('pending', { objectType: 'activity' }),
    row('rejected', { objectType: 'event' }),
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.decided, 2);
  assert.equal(result.pending, 1);
  assert.equal(result.byType.activity.total, 2);
  assert.equal(result.byType.activity.decided, 1);
});

test('the projection prices what the crawl-time filter would have cost', () => {
  const pool = [
    row('published'),                                              // filter would publish, human agreed
    row('rejected'),                                               // filter would publish, human disagreed
    row('published', { reasons: ['review:no_public_experience_signal'] }), // filter would withhold — a miss
    row('rejected', { reasons: ['hard:recruiting'] }),             // filter would withhold, correctly
  ];
  const result = gateProjection(pool);
  assert.equal(result.judged, 4);
  assert.equal(result.wouldPublish, 2);
  assert.equal(result.wouldWithhold, 2);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.missedGood, 1);
  assert.equal(result.correctlyWithheld, 1);
});

test('with nothing decided the projection stays silent instead of guessing', () => {
  const result = gateProjection([row('pending')]);
  assert.equal(result.precision, null);
  assert.equal(result.recall, null);
});
