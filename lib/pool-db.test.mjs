import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTagsBy, decide, getCandidate, listCandidates, newSince, openPool, poolSummary, setTags, undecide, upsertCandidate } from './pool-db.mjs';

const AT = new Date('2026-08-28T12:00:00Z');
const LATER = new Date('2026-08-29T12:00:00Z');

const event = (id, extra = {}) => ({
  id, title: `活动 ${id}`, titleZh: `活动 ${id}`, place: '东京', time: '详见活动页', price: '详见活动页',
  vibe: '奇妙体验', color: '#3d66f5', symbol: '◒', startDate: '2026-09-10', sourceUrl: `https://x.test/${id}`,
  source: 'Tokyo Big Sight', ...extra,
});

const fresh = () => openPool(':memory:');

test('a new candidate is pending until somebody decides', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  assert.equal(getCandidate(db, 'a').state, 'pending');
  assert.equal(listCandidates(db, { state: 'pending' }).length, 1);
  assert.equal(listCandidates(db, { state: 'published' }).length, 0);
});

test('re-crawling refreshes the candidate but never touches the decision', () => {
  // The whole point of splitting the tables: a daily re-crawl must not undo
  // yesterday's ruling.
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  decide(db, 'a', { state: 'published', decidedBy: 'human', now: AT });
  upsertCandidate(db, event('a', { price: '￥1400' }), { now: LATER });

  const row = getCandidate(db, 'a');
  assert.equal(row.price, '￥1400', 'crawl data is refreshed');
  assert.equal(row.state, 'published', 'the decision survives');
  assert.equal(row.decidedBy, 'human');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n, 1, 'no duplicate row');
});

test('firstSeenAt is preserved so "arrived today" stays meaningful', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  upsertCandidate(db, event('a'), { now: LATER });
  const row = getCandidate(db, 'a');
  assert.equal(row.firstSeenAt, AT.toISOString());
  assert.equal(row.lastSeenAt, LATER.toISOString());
});

test('popularity is stored, refreshed on re-crawl, and null when absent', () => {
  const db = fresh();
  upsertCandidate(db, event('a', { popularity: 12 }), { now: AT });
  assert.equal(getCandidate(db, 'a').popularity, 12);
  upsertCandidate(db, event('a', { popularity: 19 }), { now: LATER });
  assert.equal(getCandidate(db, 'a').popularity, 19, 'counts accumulate over time; keep the latest snapshot');
  upsertCandidate(db, event('b'), { now: AT });
  assert.equal(getCandidate(db, 'b').popularity, null, 'sources without the signal stay null, distinct from observed 0');
});

test('newSince reports only what actually arrived in the run', () => {
  const db = fresh();
  upsertCandidate(db, event('old'), { now: AT });
  upsertCandidate(db, event('old'), { now: LATER });
  upsertCandidate(db, event('new'), { now: LATER });
  assert.deepEqual(newSince(db, LATER.toISOString()).map((row) => row.id), ['new']);
});

test('a decision can be revised and withdrawn', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  decide(db, 'a', { state: 'published', now: AT });
  decide(db, 'a', { state: 'rejected', reason: '与产品不符', now: LATER });
  assert.equal(getCandidate(db, 'a').state, 'rejected');
  assert.equal(getCandidate(db, 'a').decisionReason, '与产品不符');
  undecide(db, 'a');
  assert.equal(getCandidate(db, 'a').state, 'pending');
});

test('an unknown state is refused rather than stored', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  assert.throws(() => decide(db, 'a', { state: 'maybe' }), /unknown state/);
});

test('a rule decides through the same door as a human', () => {
  // The future automatic gate is a change of author, not of schema.
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  decide(db, 'a', { state: 'published', decidedBy: 'rule:public_admission', now: AT });
  const row = getCandidate(db, 'a');
  assert.equal(row.state, 'published');
  assert.equal(row.decidedBy, 'rule:public_admission');
});

test('the object type is derived on write and filterable', () => {
  const db = fresh();
  upsertCandidate(db, event('w', { category: 'ワークショップ' }), { now: AT });
  upsertCandidate(db, event('c', { changeType: 'closing' }), { now: AT });
  assert.equal(getCandidate(db, 'w').objectType, 'activity');
  assert.deepEqual(listCandidates(db, { objectType: 'closing' }).map((row) => row.id), ['c']);
});

test('reason codes survive the round trip as arrays', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT, reasons: ['review:no_public_experience_signal'], signals: ['signal:tech'] });
  const row = getCandidate(db, 'a');
  assert.deepEqual(row.reasons, ['review:no_public_experience_signal']);
  assert.deepEqual(row.signals, ['signal:tech']);
});

test('a candidate with no codes reads back as empty arrays, not null', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  assert.deepEqual(getCandidate(db, 'a').reasons, []);
});

test('the horizon filter drops what has ended and what is too far out', () => {
  const db = fresh();
  upsertCandidate(db, event('past', { startDate: '2026-08-01', endDate: '2026-08-10' }), { now: AT });
  upsertCandidate(db, event('running', { startDate: '2026-08-01', endDate: '2026-12-01' }), { now: AT });
  upsertCandidate(db, event('soon', { startDate: '2026-09-10' }), { now: AT });
  upsertCandidate(db, event('far', { startDate: '2028-01-01' }), { now: AT });
  const ids = listCandidates(db, { horizonDays: 180, now: AT }).map((row) => row.id);
  assert.deepEqual(ids.sort(), ['running', 'soon']);
});

test('missing optional fields are stored as null, not the string "undefined"', () => {
  const db = fresh();
  upsertCandidate(db, event('a', { endDate: undefined, description: '' }), { now: AT });
  const row = getCandidate(db, 'a');
  assert.equal(row.endDate, null);
  assert.equal(row.description, null);
});

test('the summary counts states, types and sources', () => {
  const db = fresh();
  upsertCandidate(db, event('a', { category: 'ワークショップ' }), { now: AT });
  upsertCandidate(db, event('b'), { now: AT });
  upsertCandidate(db, event('c', { source: '渋谷PARCO' }), { now: AT });
  decide(db, 'a', { state: 'published', now: AT });

  const summary = poolSummary(db);
  assert.equal(summary.total, 3);
  assert.equal(summary.published, 1);
  assert.equal(summary.pending, 2);
  assert.equal(summary.rejected, 0);
  assert.ok(summary.byType.some((row) => row.objectType === 'activity' && row.state === 'published' && row.n === 1));
  assert.ok(summary.bySource.some((row) => row.source === '渋谷PARCO' && row.n === 1));
});

test('listing is ordered by start date', () => {
  const db = fresh();
  upsertCandidate(db, event('late', { startDate: '2026-10-01' }), { now: AT });
  upsertCandidate(db, event('early', { startDate: '2026-09-01' }), { now: AT });
  assert.deepEqual(listCandidates(db).map((row) => row.id), ['early', 'late']);
});

test('an ongoing candidate stays visible after its start date has passed', () => {
  // The gap this closes: a missing endDate used to mean "single-day event", so
  // an escape-room game advertised as 「開催：2024年12月29日〜」 or a shop with no
  // end at all aged out of the back office the day after it was collected —
  // 24 still-bookable SCRAP games had done exactly that by 2026-08-28.
  const db = openPool();
  const now = new Date('2026-08-28T00:00:00+09:00');
  upsertCandidate(db, { id: 'run', title: '常駐ゲーム', startDate: '2024-12-29', ongoing: true }, { now });
  upsertCandidate(db, { id: 'day', title: '単日イベント', startDate: '2024-12-29' }, { now });

  const visible = listCandidates(db, { horizonDays: 180, now }).map((row) => row.id);
  assert.deepEqual(visible, ['run'], 'the open-ended run survives, the past single day does not');
  db.close();
});

test('ongoing round-trips as a boolean, and defaults to false', () => {
  const db = openPool();
  const now = new Date('2026-08-28T00:00:00+09:00');
  upsertCandidate(db, { id: 'a', title: 'A', startDate: '2026-09-01', ongoing: true }, { now });
  upsertCandidate(db, { id: 'b', title: 'B', startDate: '2026-09-01' }, { now });
  assert.equal(getCandidate(db, 'a').ongoing, true);
  assert.equal(getCandidate(db, 'b').ongoing, false);
  db.close();
});

test('an ongoing candidate still respects the far end of the horizon', () => {
  // "No known end" is not "show it regardless of when it starts".
  const db = openPool();
  const now = new Date('2026-08-28T00:00:00+09:00');
  upsertCandidate(db, { id: 'far', title: '来年開始', startDate: '2027-12-01', ongoing: true }, { now });
  assert.deepEqual(listCandidates(db, { horizonDays: 180, now }), []);
  db.close();
});

test('decisions can be withdrawn in bulk by author, leaving other authors alone', () => {
  // 决策记录/0005 constraint 3: a machine's judgement must be disposable, so a
  // bad prompt or a swapped model can be taken off in one step. A person's
  // cannot be regenerated, so it must survive that.
  const db = openPool();
  const now = new Date('2026-08-30T00:00:00+09:00');
  for (const id of ['a', 'b', 'c']) upsertCandidate(db, { id, title: id, startDate: '2026-09-01' }, { now });
  decide(db, 'a', { state: 'published', decidedBy: 'ai:haiku-4.5', now });
  decide(db, 'b', { state: 'rejected', decidedBy: 'ai:haiku-4.5', now });
  decide(db, 'c', { state: 'published', decidedBy: 'human', now });

  const removed = db.prepare('DELETE FROM decisions WHERE decidedBy = ?').run('ai:haiku-4.5').changes;
  assert.equal(removed, 2);
  assert.equal(getCandidate(db, 'a').state, 'pending');
  assert.equal(getCandidate(db, 'b').state, 'pending');
  assert.equal(getCandidate(db, 'c').state, 'published', 'a human decision survives');
  assert.equal(getCandidate(db, 'c').decidedBy, 'human');
  db.close();
});

test('tags live in their own table and survive a re-crawl', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  setTags(db, 'a', { tags: ['深夜', '怪奇'], taggedBy: 'ai:haiku-4.5', now: AT });
  upsertCandidate(db, event('a', { price: '¥2000' }), { now: LATER });
  const row = getCandidate(db, 'a');
  assert.deepEqual(row.tags, ['深夜', '怪奇'], 'the crawl must never touch tags');
  assert.equal(row.taggedBy, 'ai:haiku-4.5');
});

test('an untagged candidate reads back with an empty tags array', () => {
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  assert.deepEqual(getCandidate(db, 'a').tags, []);
  assert.equal(getCandidate(db, 'a').taggedBy, null);
});

test('tagged-with-zero-tags is distinct from never-tagged', () => {
  // "宁缺毋滥" makes [] a legitimate model verdict; only taggedBy tells the
  // tagging script this row is done. Regressing this re-bills the same
  // candidates on every run.
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  setTags(db, 'a', { tags: [], taggedBy: 'ai:haiku-4.5', now: AT });
  const row = getCandidate(db, 'a');
  assert.deepEqual(row.tags, []);
  assert.equal(row.taggedBy, 'ai:haiku-4.5');
});

test('clearTagsBy removes one author\'s tags wholesale and nobody else\'s', () => {
  // 0005 的约束照搬：换模型/词表必须能整批重打。
  const db = fresh();
  upsertCandidate(db, event('a'), { now: AT });
  upsertCandidate(db, event('b'), { now: AT });
  setTags(db, 'a', { tags: ['深夜'], taggedBy: 'ai:haiku-4.5', now: AT });
  setTags(db, 'b', { tags: ['户外'], taggedBy: 'human', now: AT });
  clearTagsBy(db, 'ai:haiku-4.5');
  assert.deepEqual(getCandidate(db, 'a').tags, []);
  assert.deepEqual(getCandidate(db, 'b').tags, ['户外']);
});

test('an AI decision never overwrites one a person already made', () => {
  // Constraint 2: `decide` overwrites by design, so the caller must only ever
  // offer AI rulings on pending candidates — the same rule applyGate follows.
  const db = openPool();
  const now = new Date('2026-08-30T00:00:00+09:00');
  upsertCandidate(db, { id: 'x', title: 'x', startDate: '2026-09-01' }, { now });
  decide(db, 'x', { state: 'rejected', decidedBy: 'human', now });

  const pending = listCandidates(db, { state: 'pending' });
  assert.deepEqual(pending, [], 'nothing is pending, so an AI pass has nothing to rule on');
  assert.equal(getCandidate(db, 'x').decidedBy, 'human');
  db.close();
});
