import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, mapBigSightRow, normalizeAudience } from './tokyo-big-sight.mjs';

const source = { name: 'Tokyo Big Sight' };

/** A real row from the open data file, trimmed to the columns the mapper reads. */
const row = {
  '展示会名': 'Maker Faire Tokyo 2026',
  '会期(開始)': '2026/9/26',
  '会期(終了)': '2026/9/27',
  '利用施設': '西3・4ホール',
  '開催時間': '12:00-19:00 ',
  '来場対象者': '一般',
  '入場料について': 'ウェブをご参照ください',
  '内容': 'つくる楽しさを共有するDIYの祭典',
  'URL': 'https://makezine.jp/event/mft2026/',
};

test('reads Tokyo open data date formats', () => {
  assert.equal(isoDate('2026/9/2'), '2026-09-02');
  assert.equal(isoDate('2026-09-02'), '2026-09-02');
  assert.equal(isoDate('2026年9月2日'), '2026-09-02');
  assert.equal(isoDate(''), null);
  assert.equal(isoDate('未定'), null);
});

test('audience separators collapse to one vocabulary', () => {
  // The file uses both 商談/一般 and 商談・一般; publication must not depend on which.
  assert.equal(normalizeAudience('商談/一般'), '商談・一般');
  assert.equal(normalizeAudience('商談・一般'), '商談・一般');
  assert.equal(normalizeAudience('一般'), '一般');
  assert.equal(normalizeAudience('商談'), '商談');
  assert.equal(normalizeAudience(''), '不明');
});

test('maps a public event with the organiser link and venue hall', () => {
  const event = mapBigSightRow(row, source);
  assert.equal(event.title, 'Maker Faire Tokyo 2026');
  assert.equal(event.startDate, '2026-09-26');
  assert.equal(event.endDate, '2026-09-27');
  assert.equal(event.place, '东京Big Sight · 西3・4ホール');
  assert.equal(event.time, '12:00-19:00');
  assert.equal(event.audience, '一般');
  assert.equal(event.sourceUrl, 'https://makezine.jp/event/mft2026/');
  assert.equal(event.description, 'つくる楽しさを共有するDIYの祭典');
});

test('a trade-only row still maps, carrying the audience that will hold it back', () => {
  // Filtering happens downstream; the adapter's job is to report the fact.
  const event = mapBigSightRow({ ...row, '展示会名': 'ジャパンジュエリーフェア2026', '来場対象者': '商談' }, source);
  assert.equal(event.audience, '商談');
});

test('rows without a title or a start date are dropped', () => {
  assert.equal(mapBigSightRow({ ...row, '展示会名': '' }, source), null);
  assert.equal(mapBigSightRow({ ...row, '会期(開始)': '未定' }, source), null);
});

test('a missing organiser URL falls back to the venue calendar', () => {
  assert.equal(mapBigSightRow({ ...row, URL: '' }, source).sourceUrl, 'https://www.bigsight.jp/visitor/event/');
});

test('an event with no end date omits the field rather than emitting undefined', () => {
  const event = mapBigSightRow({ ...row, '会期(終了)': '' }, source);
  assert.ok(!('endDate' in event));
});

test('ids are stable across runs and distinct between events', () => {
  const first = mapBigSightRow(row, source);
  assert.equal(first.id, mapBigSightRow(row, source).id);
  assert.notEqual(first.id, mapBigSightRow({ ...row, '展示会名': '別の展示会', URL: 'https://other.example/' }, source).id);
});
