import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SAMPLE, agreementByReason, agreementBySource, attachLabels, collectCandidates, coverage, emptyLabels, gateProjection, removeLabel, upsertLabel } from './editorial-labels.mjs';

const AT = '2026-08-28T12:00:00.000Z';
const activity = (id, extra = {}) => ({ id, title: `活动 ${id}`, source: 'My TOKYO', ...extra });
const reviewItem = (id, reasons, extra = {}) => ({ activity: activity(id, extra), decision: 'review', reasons, signals: [] });

const labelAll = (candidates, verdicts) => {
  let store = emptyLabels();
  candidates.forEach((candidate, index) => {
    if (verdicts[index]) store = upsertLabel(store, candidate.activity.id, { verdict: verdicts[index], at: AT });
  });
  return attachLabels(candidates, store);
};

test('a label records a verdict and can be revised or removed', () => {
  let store = upsertLabel(emptyLabels(), 'a', { verdict: 'good', note: '值得专程去', at: AT });
  assert.equal(store.labels.a.verdict, 'good');
  store = upsertLabel(store, 'a', { verdict: 'bad', at: AT });
  assert.equal(store.labels.a.verdict, 'bad');
  assert.deepEqual(removeLabel(store, 'a').labels, {});
});

test('an unknown verdict is rejected rather than stored', () => {
  assert.throws(() => upsertLabel(emptyLabels(), 'a', { verdict: 'maybe', at: AT }), /unknown verdict/);
});

test('candidates merge published and review lists without losing either fact', () => {
  const candidates = collectCandidates({
    published: [activity('a'), activity('b')],
    review: [reviewItem('b', ['review:no_public_experience_signal'])],
  });
  assert.equal(candidates.length, 2);
  const b = candidates.find((candidate) => candidate.activity.id === 'b');
  // b is in review AND on the front page — the console must show both.
  assert.equal(b.decision, 'review');
  assert.equal(b.published, true);
  assert.deepEqual(b.reasons, ['review:no_public_experience_signal']);
});

test('coverage counts judged candidates per pipeline decision', () => {
  const candidates = collectCandidates({ published: [activity('a')], review: [reviewItem('b', ['x']), reviewItem('c', ['x'])] });
  const result = coverage(labelAll(candidates, ['good', 'bad', null]));
  assert.equal(result.total, 3);
  assert.equal(result.labelled, 2);
  assert.equal(result.byDecision.review.total, 2);
  assert.equal(result.byDecision.review.labelled, 1);
});

test('a reason whose candidates humans want is reported as a bad filter', () => {
  const candidates = collectCandidates({ review: Array.from({ length: 12 }, (_, i) => reviewItem(`e${i}`, ['review:no_public_experience_signal'])) });
  const verdicts = Array.from({ length: 12 }, (_, i) => (i < 9 ? 'good' : 'bad'));
  const [row] = agreementByReason(labelAll(candidates, verdicts));
  assert.equal(row.code, 'review:no_public_experience_signal');
  assert.equal(row.labelled, 12);
  assert.equal(row.good, 9);
  assert.equal(row.goodRate, 0.75);
  assert.equal(row.enoughSamples, true);
});

test('a thinly sampled reason is marked as not yet conclusive', () => {
  const candidates = collectCandidates({ review: Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => reviewItem(`e${i}`, ['review:trade_only_admission'])) });
  const [row] = agreementByReason(labelAll(candidates, Array(MIN_SAMPLE - 1).fill('bad')));
  assert.equal(row.enoughSamples, false);
});

test('unsure verdicts are excluded from every rate', () => {
  const candidates = collectCandidates({ review: [reviewItem('a', ['x']), reviewItem('b', ['x'])] });
  const [row] = agreementByReason(labelAll(candidates, ['good', 'unsure']));
  assert.equal(row.labelled, 1);
  assert.equal(row.goodRate, 1);
});

test('unlabelled candidates contribute to nothing', () => {
  const candidates = collectCandidates({ review: [reviewItem('a', ['x'])] });
  assert.deepEqual(agreementByReason(attachLabels(candidates, emptyLabels())), []);
});

test('agreement is also reported per source', () => {
  const candidates = collectCandidates({
    review: [reviewItem('a', ['x'], { source: 'My TOKYO' }), reviewItem('b', ['x'], { source: '渋谷PARCO' })],
  });
  const rows = agreementBySource(labelAll(candidates, ['good', 'bad']));
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.source === '渋谷PARCO').goodRate, 0);
});

test('the gate projection prices what turning the rules on would cost', () => {
  const candidates = collectCandidates({
    published: [activity('keep1'), activity('keep2')],
    review: [reviewItem('rev1', ['x']), reviewItem('rev2', ['x'])],
  });
  // keep1 wanted, keep2 not; rev1 wanted (the gate would have lost it), rev2 not.
  const result = gateProjection(labelAll(candidates, ['good', 'bad', 'good', 'bad']));
  assert.equal(result.judged, 4);
  assert.equal(result.wouldPublish, 2);
  assert.equal(result.wouldWithhold, 2);
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.missedGood, 1);
  assert.equal(result.correctlyWithheld, 1);
});

test('the gate projection stays silent with nothing judged', () => {
  const candidates = collectCandidates({ review: [reviewItem('a', ['x'])] });
  const result = gateProjection(attachLabels(candidates, emptyLabels()));
  assert.equal(result.judged, 0);
  assert.equal(result.precision, null);
  assert.equal(result.recall, null);
});
