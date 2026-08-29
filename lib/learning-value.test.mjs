import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBySignature, groupValue, rankByLearningValue, signatureOf, uncertainty } from './learning-value.mjs';

const candidate = (overrides = {}) => ({ id: 'a', objectType: 'place', reasons: [], signals: [], state: 'pending', ...overrides });

test('the signature is the kind of question, not the source it came from', () => {
  // 「place with no positive signal」 is the same question whether it came from a
  // mineral fair or a ward's open data; folding source in would fragment every
  // group down to a sample of one.
  const a = candidate({ source: '東京ミネラルショー', reasons: ['review:no_public_experience_signal'] });
  const b = candidate({ source: '中野区 スポーツ施設', reasons: ['review:no_public_experience_signal'] });
  assert.equal(signatureOf(a), signatureOf(b));
  assert.notEqual(signatureOf(a), signatureOf(candidate({ objectType: 'event', reasons: ['review:no_public_experience_signal'] })));
});

test('code order does not change the signature', () => {
  assert.equal(
    signatureOf(candidate({ signals: ['signal:off_street', 'signal:art'] })),
    signatureOf(candidate({ signals: ['signal:art', 'signal:off_street'] })),
  );
});

test('a never-judged group is maximally uncertain', () => {
  assert.equal(uncertainty({ decided: 0 }), 1);
});

test('a group everyone agreed on is settled; a 50/50 group is not', () => {
  const settled = uncertainty({ decided: 20, published: 20 });
  const split = uncertainty({ decided: 20, published: 10 });
  assert.ok(settled < 0.1, `unanimous should be near 0, got ${settled}`);
  assert.ok(split > 0.9, `an even split should be near 1, got ${split}`);
});

test('two decisions do not settle a group', () => {
  // 决策记录/0002 in miniature: a run of two proves very little, so the group
  // must stay largely unknown.
  assert.ok(uncertainty({ decided: 2, published: 2 }) > 0.7);
  assert.ok(uncertainty({ decided: 2, published: 2 }) < uncertainty({ decided: 0 }));
});

test('reach counts, but sub-linearly', () => {
  // A group 14× larger must not be 14× more valuable, or the biggest group
  // monopolises the queue and a reviewer only ever sees one kind of question.
  const medium = groupValue({ pending: 20, decided: 0 });
  const huge = groupValue({ pending: 283, decided: 0 });
  assert.ok(huge > medium, 'more pending is still worth more');
  assert.ok(huge < medium * 2, `14x the group should be well under 2x the value, got ${huge / medium}x`);
});

test('an unjudged group outranks a bigger group that is already understood', () => {
  // The real case on 2026-08-30: 283 `place` candidates rested on 3 decisions
  // while 39 signatures had never been judged at all.
  const unknown = groupValue({ pending: 21, decided: 0 });
  const understood = groupValue({ pending: 283, decided: 40, published: 38 });
  assert.ok(unknown > understood, `${unknown} should beat ${understood}`);
});

test('groups tally pending and decided separately', () => {
  const groups = groupBySignature([
    candidate({ id: '1' }),
    candidate({ id: '2', state: 'published' }),
    candidate({ id: '3', state: 'rejected' }),
    candidate({ id: '4', objectType: 'event' }),
  ]);
  assert.equal(groups.size, 2);
  const place = groups.get(signatureOf(candidate()));
  assert.deepEqual([place.pending, place.published, place.rejected, place.decided], [1, 1, 1, 2]);
});

test('one candidate per signature is shown before a second of any', () => {
  // Without it a reviewer spends a whole session inside one group and learns
  // one thing.
  const many = Array.from({ length: 8 }, (_, index) => candidate({ id: `p${index}` }));
  const others = [
    candidate({ id: 'e', objectType: 'event', signals: ['signal:theater'] }),
    candidate({ id: 'x', objectType: 'exhibition', signals: ['signal:art'] }),
  ];
  const front = rankByLearningValue([...many, ...others]).slice(0, 3).map((row) => row.signature);
  assert.equal(new Set(front).size, 3, `expected three different kinds first, got ${front}`);
});

test('only pending candidates are queued, but decided ones still inform the groups', () => {
  const rows = [
    candidate({ id: 'p' }),
    candidate({ id: 'd', state: 'published' }),
  ];
  const ranked = rankByLearningValue(rows);
  assert.deepEqual(ranked.map((row) => row.id), ['p']);
  assert.equal(ranked[0].groupDecided, 1, 'the judged sibling is counted');
  assert.equal(ranked[0].groupPending, 1);
});

test('ranking is deterministic, and a tiebreak orders within a group', () => {
  const rows = [candidate({ id: 'b' }), candidate({ id: 'a' })];
  assert.deepEqual(rankByLearningValue(rows).map((row) => row.id), ['a', 'b']);
  const byIdDesc = (a, b) => String(b.id).localeCompare(String(a.id));
  assert.deepEqual(rankByLearningValue(rows, { tiebreak: byIdDesc }).map((row) => row.id), ['b', 'a']);
});

test('this is not a quality score', () => {
  // A candidate can top this queue precisely because nobody knows whether its
  // kind is any good; nothing here decides or publishes.
  const ranked = rankByLearningValue([candidate()]);
  assert.equal(ranked[0].state, 'pending');
  assert.ok(!('publish' in ranked[0]) && !('decidedBy' in ranked[0]));
});

test('an empty pool yields an empty queue rather than throwing', () => {
  assert.deepEqual(rankByLearningValue([]), []);
});
