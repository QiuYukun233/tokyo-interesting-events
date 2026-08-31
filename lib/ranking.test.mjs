import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterKey, rankCandidates, scoreFor, tagsFor, weightsFromEvidence } from './ranking.mjs';

const NOW = '2026-08-29T00:00:00+09:00';
const candidate = (overrides = {}) => ({ id: 'a', title: 'x', startDate: '2026-09-01', reasons: [], signals: [], ...overrides });

test('weights come from observed publish rates, not from hand-tuning', () => {
  const weights = weightsFromEvidence([
    { code: 'signal:theater', publishRate: 0.63, decided: 27 },
    { code: 'signal:art', publishRate: 0.25, decided: 105 },
  ]);
  assert.ok(weights.get('signal:theater') > 0, 'a code humans mostly published lifts');
  assert.ok(weights.get('signal:art') < 0, 'a code humans mostly rejected sinks');
});

test('a code with too few decisions carries no weight at all', () => {
  // 决策记录/0002: a first pass is not evidence. An unproven code must not
  // quietly start steering the queue.
  const weights = weightsFromEvidence([{ code: 'signal:hobby', publishRate: 1, decided: 1 }]);
  assert.equal(weights.get('signal:hobby'), undefined);
  assert.equal(scoreFor(candidate({ signals: ['signal:hobby'] }), weights, { now: NOW }), scoreFor(candidate(), weights, { now: NOW }));
});

test('a closing outranks an equivalent candidate, because a deadline cannot wait', () => {
  const weights = new Map();
  const closing = scoreFor(candidate({ changeType: 'closing' }), weights, { now: NOW });
  assert.ok(closing > scoreFor(candidate(), weights, { now: NOW }));
});

test('sooner beats later, but never outweighs the evidence', () => {
  const weights = weightsFromEvidence([{ code: 'signal:theater', publishRate: 0.9, decided: 50 }]);
  const soonNoSignal = scoreFor(candidate({ startDate: '2026-08-30' }), weights, { now: NOW });
  const farWithSignal = scoreFor(candidate({ startDate: '2027-02-01', signals: ['signal:theater'] }), weights, { now: NOW });
  assert.ok(farWithSignal > soonNoSignal, 'evidence dominates recency');
});

test('popularity lifts a candidate over an equivalent one without it', () => {
  const weights = new Map();
  const popular = scoreFor(candidate({ popularity: 19 }), weights, { now: NOW });
  const silent = scoreFor(candidate(), weights, { now: NOW });
  const zero = scoreFor(candidate({ popularity: 0 }), weights, { now: NOW });
  assert.ok(popular > silent);
  assert.equal(zero, silent, 'observed zero and no signal both add nothing');
});

test('popularity is capped so a hit show cannot outrank a closing deadline', () => {
  const weights = new Map();
  const hit = scoreFor(candidate({ popularity: 500 }), weights, { now: NOW });
  const closing = scoreFor(candidate({ changeType: 'closing' }), weights, { now: NOW });
  assert.ok(hit < closing);
});

test('rankCandidates never clobbers the vocabulary tags from the pool', () => {
  // Card labels live on displayTags; `tags` belongs to the explore queue.
  const [ranked] = rankCandidates([candidate({ tags: ['深夜'], ongoing: true })], {});
  assert.deepEqual(ranked.tags, ['深夜']);
  assert.deepEqual(ranked.displayTags, ['常驻']);
});

test('an already-running candidate is not penalised for having started', () => {
  const weights = new Map();
  assert.ok(scoreFor(candidate({ startDate: '2026-01-01' }), weights, { now: NOW }) > 0);
});

test('a candidate with an unparseable date still scores rather than throwing', () => {
  assert.equal(typeof scoreFor(candidate({ startDate: '未定' }), new Map(), { now: NOW }), 'number');
});

test('the cluster is the venue, so booths and floors of one place group together', () => {
  // 708 stalls at one fair are not 708 questions — 方案 §4.3.
  assert.equal(
    clusterKey({ source: '手作市集', place: '東京ドームシティ プリズムホール · ブースA-05' }),
    clusterKey({ source: '手作市集', place: '東京ドームシティ プリズムホール · ブースM-04' }),
  );
  assert.equal(
    clusterKey({ source: 'x', place: '東京都台東区蔵前1-7-10 マツリビル 2F' }),
    clusterKey({ source: 'x', place: '東京都台東区蔵前1-7-10 マツリビル 3F' }),
  );
  assert.notEqual(clusterKey({ source: 'a', place: 'A' }), clusterKey({ source: 'b', place: 'A' }));
});

test('one candidate per cluster is shown before the second of any cluster', () => {
  // The whole point: a date-ordered backlog shows 708 stalls of one fair in a
  // row and a reviewer never reaches the rest of the pool.
  const fair = Array.from({ length: 5 }, (_, index) => candidate({ id: `fair-${index}`, source: 'fair', place: 'Dome · Booth' }));
  const others = [
    candidate({ id: 'theatre', source: 'theatre', place: 'Theatre' }),
    candidate({ id: 'museum', source: 'museum', place: 'Museum' }),
  ];
  const ranked = rankCandidates([...fair, ...others], { now: NOW });
  const firstThree = ranked.slice(0, 3).map((row) => row.cluster);
  assert.equal(new Set(firstThree).size, 3, `expected three different clusters first, got ${firstThree}`);
});

test('every candidate keeps its cluster size, so a caller can collapse the tail', () => {
  const rows = [
    candidate({ id: '1', source: 'fair', place: 'Dome · A' }),
    candidate({ id: '2', source: 'fair', place: 'Dome · B' }),
    candidate({ id: '3', source: 'solo', place: 'Elsewhere' }),
  ];
  const ranked = rankCandidates(rows, { now: NOW });
  assert.equal(ranked.find((row) => row.id === '1').clusterSize, 2);
  assert.equal(ranked.find((row) => row.id === '3').clusterSize, 1);
  assert.deepEqual(ranked.map((row) => row.clusterRank).sort(), [1, 1, 2]);
});

test('ranking never decides anything', () => {
  // Ordering is not judging: 决策记录/0003 keeps publication in `decisions`.
  const ranked = rankCandidates([candidate({ state: 'pending' })], { now: NOW });
  assert.equal(ranked[0].state, 'pending');
  assert.ok(!('publish' in ranked[0]) && !('decidedBy' in ranked[0]));
});

test('tags describe, they do not judge', () => {
  assert.deepEqual(tagsFor({ signals: ['signal:residential_room'], ongoing: true }), ['住宅楼一室', '常驻']);
  assert.deepEqual(tagsFor({ signals: ['signal:off_street'] }), ['不在街面']);
  assert.deepEqual(tagsFor({ changeType: 'closing' }), ['即将消失']);
  assert.deepEqual(tagsFor({ audience: '招待' }), ['招待']);
  assert.deepEqual(tagsFor({ audience: '公開' }), [], 'the ordinary case needs no tag');
  assert.deepEqual(tagsFor({}), []);
});

test('a room number wins over the coarser off-street tag', () => {
  assert.deepEqual(tagsFor({ signals: ['signal:off_street', 'signal:residential_room'] }), ['住宅楼一室']);
});

test('ranking is stable for identical candidates', () => {
  const rows = [candidate({ id: 'b' }), candidate({ id: 'a' })];
  assert.deepEqual(rankCandidates(rows, { now: NOW }).map((row) => row.id), ['a', 'b']);
});

test('the three score terms keep their order of importance', () => {
  // closing > evidence > recency, whatever the numbers. If recency could
  // outweigh evidence the queue would just be a calendar.
  const weights = weightsFromEvidence([{ code: 'signal:art', publishRate: 0, decided: 100 }]);
  const worstCode = scoreFor(candidate({ signals: ['signal:art'], startDate: '2026-08-30' }), weights, { now: NOW });
  const noCode = scoreFor(candidate({ startDate: '2027-06-01' }), weights, { now: NOW });
  assert.ok(noCode > worstCode, 'a code humans always rejected sinks below a far-off unknown');

  const closing = scoreFor(candidate({ changeType: 'closing', signals: ['signal:art'] }), weights, { now: NOW });
  const best = scoreFor(candidate({ startDate: '2026-08-29' }), weightsFromEvidence([{ code: 'x', publishRate: 1, decided: 100 }]), { now: NOW });
  assert.ok(closing > best, 'a deadline outranks anything without one');
});

test('no single source can fill the front of the queue', () => {
  // Round-robin over venue alone was not enough: CoRich's 363 shows are each at
  // a different theatre, so every one was its own cluster and they all tied at
  // rank 1, replacing one wall of candidates with another.
  const theatre = Array.from({ length: 20 }, (_, index) => candidate({ id: `co-${index}`, source: 'CoRich', place: `Theatre ${index}` }));
  const others = [
    candidate({ id: 'fair', source: 'fair', place: 'Dome' }),
    candidate({ id: 'shop', source: 'minkei', place: 'Shop' }),
  ];
  const front = rankCandidates([...theatre, ...others], { now: NOW }).slice(0, 3).map((row) => row.source);
  assert.equal(new Set(front).size, 3, `expected three different sources first, got ${front}`);
});

test('within one round, a source leads with its own best candidate', () => {
  const weights = weightsFromEvidence([{ code: 'signal:theater', publishRate: 0.9, decided: 50 }]);
  const ranked = rankCandidates([
    candidate({ id: 'plain', source: 'CoRich', place: 'A' }),
    candidate({ id: 'signalled', source: 'CoRich', place: 'B', signals: ['signal:theater'] }),
  ], { weights, now: NOW });
  assert.equal(ranked[0].id, 'signalled');
});
