import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECT_TYPES, OBJECT_TYPE_LABELS, groupByObjectType, objectTypeFor, runLengthDays } from './object-type.mjs';

test('every declared type has a human label', () => {
  for (const type of OBJECT_TYPES) assert.ok(OBJECT_TYPE_LABELS[type], type);
});

test('shop lifecycle wins over anything else in the text', () => {
  // A closing is a deadline; that is the reason to care, whatever else it mentions.
  assert.equal(objectTypeFor({ changeType: 'closing', title: '閉店前の企画展を開催' }), 'closing');
  assert.equal(objectTypeFor({ changeType: 'opening', title: '古書店がオープン' }), 'opening');
  assert.equal(objectTypeFor({ changeType: 'discovery', title: '店舗が移転' }), 'place');
});

test('hands-on genres become participable activities', () => {
  for (const category of ['ワークショップ', '見学・ツアー', 'こども', '鑑賞サポート', '歴史・伝統']) {
    assert.equal(objectTypeFor({ category, title: 'x', startDate: '2026-09-01' }), 'activity', category);
  }
});

test('performances and talks are single scheduled events', () => {
  assert.equal(objectTypeFor({ category: 'パフォーマンス', title: 'ダンス公演', startDate: '2026-09-01' }), 'event');
  assert.equal(objectTypeFor({ category: 'トーク・講座', title: 'ミュージアムトーク', startDate: '2026-09-01' }), 'event');
});

test('a long-running show reading as an exhibition is one', () => {
  assert.equal(objectTypeFor({ title: 'TOPコレクション 明日の食卓', startDate: '2026-07-02', endDate: '2026-09-21' }), 'exhibition');
  assert.equal(objectTypeFor({ title: '企画展 江戸絵画', startDate: '2026-07-25', endDate: '2026-10-18' }), 'exhibition');
});

test('a long run without exhibition wording is still an exhibition-shaped thing', () => {
  assert.equal(objectTypeFor({ title: 'KOJIMA PRODUCTIONS×PARCO STRAND STORE', startDate: '2026-06-06', endDate: '2026-08-30' }), 'exhibition');
});

test('a short run defaults to a single event', () => {
  assert.equal(objectTypeFor({ title: '文学フリマ東京43', startDate: '2026-11-08', endDate: '2026-11-08' }), 'event');
  assert.equal(objectTypeFor({ title: '日本ダーツ祭り', startDate: '2026-09-20', endDate: '2026-09-21' }), 'event');
  assert.equal(objectTypeFor({ title: '何かの催し', startDate: '2026-09-20' }), 'event');
});

test('a special opening of a normally closed place is its own type', () => {
  assert.equal(objectTypeFor({ title: '研究所 一般公開', startDate: '2026-09-20' }), 'open_facility');
  assert.equal(objectTypeFor({ title: 'バックヤードツアー 特別公開', startDate: '2026-09-20' }), 'open_facility');
});

test('run length counts inclusive days and is null without an end', () => {
  assert.equal(runLengthDays({ startDate: '2026-09-01', endDate: '2026-09-01' }), 1);
  assert.equal(runLengthDays({ startDate: '2026-09-01', endDate: '2026-09-03' }), 3);
  assert.equal(runLengthDays({ startDate: '2026-09-01' }), null);
});

test('grouping keeps the declared order and every type as a key', () => {
  const groups = groupByObjectType([
    { changeType: 'closing', title: 'a' },
    { category: 'ワークショップ', title: 'b', startDate: '2026-09-01' },
    { title: 'c', startDate: '2026-09-01' },
  ]);
  assert.deepEqual(Object.keys(groups), OBJECT_TYPES);
  assert.equal(groups.closing.length, 1);
  assert.equal(groups.activity.length, 1);
  assert.equal(groups.event.length, 1);
  assert.equal(groups.exhibition.length, 0);
});

test('a stored objectType is trusted over re-deriving it', () => {
  const groups = groupByObjectType([{ objectType: 'place', title: '何か', startDate: '2026-09-01' }]);
  assert.equal(groups.place.length, 1);
  assert.equal(groups.event.length, 0);
});
