import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeidaiMuseum } from './geidai-museum.mjs';

test('parses current and upcoming Geidai exhibitions as factual records', () => {
  const html = `<a href="/exhibit/2026/a.html"><span class="exhibit_block"><span class="excerpt above"><span class="open">開催中</span></span><span class="title">藝大式 美術のミカタ</span><span class="excerpt"><span class="period">日程</span>2026年07月24日 - 2026年09月23日</span></span></a>`;
  const [event] = parseGeidaiMuseum(html, { name: '東京藝術大学大学美術館', origin: 'https://museum.geidai.ac.jp', place: '上野本館' });
  assert.equal(event.startDate, '2026-07-24');
  assert.equal(event.endDate, '2026-09-23');
  assert.equal(event.place, '上野本館');
  assert.equal(event.sourceUrl, 'https://museum.geidai.ac.jp/exhibit/2026/a.html');
});
