import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWasedaEvents } from './waseda-events.mjs';

test('keeps cultural public events and rejects admissions sessions', () => {
  const card = (title, classes) => `<li class="cal-event--listWrap--list ${classes}"><p class="cal-event--list--summary--title"><a href="/event/a">${title}</a></p><li class="cal-icon cal-icon-time">10:00～17:00</li><li class="cal-icon cal-icon-date">8/1〜9/1</li><li class="cal-icon cal-icon-spot">国際文学館</li></li>`;
  const html = `<ul>${card('翻訳プロジェクト小展示', 'js-event-date-2026-08-01 js-event-date-2026-09-01')}${card('入試説明会', 'js-event-date-2026-09-02')}</ul>`;
  const events = parseWasedaEvents(html, { name: '早稲田大学', origin: 'https://www.waseda.jp' });
  assert.equal(events.length, 1);
  assert.equal(events[0].endDate, '2026-09-01');
});
