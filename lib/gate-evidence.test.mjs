import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SAMPLE, agreementByObjectType, agreementByReason, agreementBySource, coverage, gateProjection, humanCoverage } from './gate-evidence.mjs';

// Rates are about what people want, so a decided fixture is a human decision
// unless a test says otherwise — see "Only a person's decisions count".
const row = (state, extra = {}) => ({
  id: Math.random().toString(36).slice(2), state, objectType: 'event', source: 'My TOKYO',
  decidedBy: state === 'pending' ? undefined : 'human',
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

test('a rule cannot prove itself: only a person’s decisions count', () => {
  // On 2026-08-30 `review:trade_only_admission` showed 0% over 101 decisions
  // and looked like the strongest gate candidate in the pool. All 101 were made
  // by the rule of that name; no person had ever judged one. The number was a
  // mirror, and it was about to be acted on.
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, objectType: 'event', state: 'rejected', decidedBy: 'rule:trade_only_admission', reasons: ['review:trade_only_admission'], signals: [] })),
    { id: 'h1', objectType: 'event', state: 'published', decidedBy: 'human', reasons: ['review:trade_only_admission'], signals: [] },
  ];
  const [bucket] = agreementByReason(rows);
  assert.equal(bucket.decided, 1, 'the 20 machine decisions must not count');
  assert.equal(bucket.publishRate, 1, 'the only person who looked wanted it');
  assert.equal(bucket.enoughSamples, false, 'and one sample is not evidence');
});

test('an AI pass cannot flood the rates with its own opinions', () => {
  // The same trap waits for 决策记录/0005: a model judging thousands of
  // candidates would otherwise be told it agrees with itself.
  const rows = [
    ...Array.from({ length: 50 }, (_, i) => ({ id: `a${i}`, objectType: 'place', state: 'rejected', decidedBy: 'ai:haiku-4.5', reasons: [], signals: ['signal:art'] })),
    { id: 'h', objectType: 'place', state: 'published', decidedBy: 'human', reasons: [], signals: ['signal:art'] },
  ];
  assert.equal(agreementByReason(rows)[0].decided, 1);
  assert.equal(agreementBySource(rows).reduce((sum, r) => sum + r.decided, 0), 1);
  assert.equal(agreementByObjectType(rows)[0].decided, 1);
});

test('the gate projection is scored against people, not against the rules', () => {
  // Measuring the filter against rows the rules settled is grading its own
  // homework: the rules reject exactly what the filter flagged, so precision
  // and recall would both approach 1 by construction.
  const machineRejected = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, objectType: 'event', state: 'rejected', decidedBy: 'rule:not_a_destination', reasons: ['hard:bulletin'], signals: [] }));
  const humanWanted = { id: 'h', objectType: 'event', state: 'published', decidedBy: 'human', reasons: ['hard:bulletin'], signals: [] };
  const projection = gateProjection([...machineRejected, humanWanted]);
  assert.equal(projection.judged, 1);
  assert.equal(projection.missedGood, 1, 'the filter would have withheld something the person wanted');
});

test('humanCoverage separates what a person saw from what a machine settled', () => {
  const rows = [
    { id: 'a', objectType: 'event', state: 'published', decidedBy: 'human' },
    { id: 'b', objectType: 'event', state: 'rejected', decidedBy: 'human' },
    { id: 'c', objectType: 'event', state: 'rejected', decidedBy: 'rule:x' },
    { id: 'd', objectType: 'event', state: 'pending' },
  ];
  assert.deepEqual(humanCoverage(rows), { total: 4, judgedByHuman: 2, publishedByHuman: 1, settledByMachine: 1 });
});
