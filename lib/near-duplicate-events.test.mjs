import assert from 'node:assert/strict';
import test from 'node:test';
import { areNearDuplicateEvents, dedupeNearDuplicateEvents, titleOverlap } from './near-duplicate-events.mjs';

test('finds cross-posted Japanese event titles on the same date', () => {
  const long = '令和８年度多摩川水系上下流交流会の参加者を募集します ～いつも飲んでいる水道水の“はじまり”を知りたくないですか？～';
  const short = '多摩川水系上下流交流会の参加者を募集中です';
  assert.ok(titleOverlap(long, short) >= 0.72);
  assert.equal(areNearDuplicateEvents({ title: long, startDate: '2026-08-28' }, { title: short, startDate: '2026-08-28' }), true);
});

test('does not merge the same series on different dates', () => {
  assert.equal(areNearDuplicateEvents({ title: '夜の科学観察会', startDate: '2026-09-01' }, { title: '夜の科学観察会', startDate: '2026-09-08' }), false);
});

test('keeps alternate evidence URLs when merging', () => {
  const events = dedupeNearDuplicateEvents([
    { title: 'ロボット体験展示会 参加者募集', startDate: '2026-09-01', sourceUrl: 'https://a.test/1', place: '東京' },
    { title: 'ロボット体験展示会の参加者を募集中', startDate: '2026-09-01', sourceUrl: 'https://b.test/2', place: '東京ビッグサイト' },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].duplicateCount, 2);
  assert.equal(events[0].alternateSourceUrls.length, 1);
});
