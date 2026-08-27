import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShibuyaParcoEvents } from './shibuya-parco-events.mjs';

test('keeps distinctive PARCO events and rejects generic beauty sales', () => {
  const card = (title, category) => `<div class="c-event-entry"><a href="/event/detail/?id=1"><img src="/a.jpg"><figcaption class="c-event-entry__category">${category}</figcaption><p class="c-event-entry__date">2026.8.28 - 2026.9.6</p><h3 class="c-event-entry__title">${title}</h3><p class="c-event-entry__floor">4F GALLERY</p></a></div>`;
  const events = parseShibuyaParcoEvents(card('KOJIMA PRODUCTIONS GAME ART展', 'GALLERY') + card('TOM FORD BEAUTY', 'POPUP'), { name: '渋谷PARCO', origin: 'https://shibuya.parco.jp' });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-08-28');
  assert.equal(events[0].imageUrl, 'https://shibuya.parco.jp/a.jpg');
});
