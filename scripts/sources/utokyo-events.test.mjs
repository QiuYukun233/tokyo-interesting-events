import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUTokyoEvents } from './utokyo-events.mjs';

test('parses public UTokyo event cards and preserves audience/description', () => {
  const html = `<div class="p-top-events__item"><a href="/focus/ja/events/lecture.html"><div class="p-top-events__item-body"><p class="p-top-events__item-date">2026年9月30日</p><p class="p-top-events__item-title">東京カレッジ講演会「AIと気候変動の真実」</p><div class="p-top-events__tags"><p class="p-top-events__tag">本郷地区</p><p class="p-top-events__tag">一般公開</p></div></div></a></div>
  <div class="p-top-events__item"><a href="/focus/ja/events/admission.html"><div class="p-top-events__item-body"><p class="p-top-events__item-date">2026年10月1日</p><p class="p-top-events__item-title">入試説明会</p><div class="p-top-events__tags"><p class="p-top-events__tag">オンライン</p></div></div></a></div>`;
  const events = parseUTokyoEvents(html);
  assert.equal(events.length, 2);
  assert.equal(events[0].startDate, '2026-09-30');
  assert.equal(events[0].sourceUrl, 'https://www.u-tokyo.ac.jp/focus/ja/events/lecture.html');
  assert.equal(events[0].audience, '本郷地区 / 一般公開');
  assert.match(events[0].description, /本郷地区/);
});

test('skips malformed cards without a date or title', () => {
  assert.equal(parseUTokyoEvents('<div class="p-top-events__item"><p class="p-top-events__item-title">未定</p></div>').length, 0);
});
