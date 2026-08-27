import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventCandidate, dateFrom, mergeAndSelectEvents, vibeFor } from './event-utils.mjs';

test('dateFrom converts Japanese dates to ISO dates', () => {
  assert.equal(dateFrom('2026年 8月3日（日）'), '2026-08-03');
  assert.equal(dateFrom('開催日未定'), null);
});

test('createEventCandidate normalizes source records', () => {
  const event = createEventCandidate({ sourceName: 'Fixture', sourceUrl: 'https://example.test/event', title: 'ロボット展示', startDate: '2026-09-01', text: '展示', visualIndex: 1 });
  assert.equal(event.titleZh, 'ロボット展示');
  assert.equal(event.vibe, '艺术现场');
  assert.equal(event.color, '#ef5b3f');
  assert.equal(event.source, 'Fixture');
});

test('mergeAndSelectEvents keeps existing event details on duplicate', () => {
  const now = new Date('2026-08-27T00:00:00+09:00');
  const base = { title: '同一活动', sourceUrl: 'https://example.test/a', startDate: '2026-08-28' };
  assert.deepEqual(mergeAndSelectEvents({ manual: [{ ...base, price: '手动' }], fetched: [{ ...base, price: '抓取' }], existing: [{ ...base, price: '保留' }], now }), [{ ...base, price: '保留' }]);
});

test('vibeFor keeps editorial labels', () => {
  assert.equal(vibeFor('現代美術展'), '艺术现场');
  assert.equal(vibeFor('インディーズライブ'), '小众音乐');
});
