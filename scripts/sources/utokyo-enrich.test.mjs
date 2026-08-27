import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichUTokyoEvent } from './utokyo-enrich.mjs';

const event = { title: '公開講演会', sourceUrl: 'https://www.u-tokyo.ac.jp/focus/ja/events/example.html', place: '东京大学', price: '详见活动页' };
const detail = `<html><head><meta property="og:image" content="/content/poster.jpg"></head><body>
<table class="c-table-news"><tr><th>対象者</th><td>社会人・一般</td></tr><tr><th>開催場所</th><td>本郷地区</td></tr><tr><th>会場</th><td>東京大学 大講堂</td></tr><tr><th>参加費</th><td>無料</td></tr></table>
<div class="editableHtml"><h3>公開講演会</h3><p>研究者が最新の成果を紹介します。</p><p>一般参加歓迎です。</p></div></body></html>`;

test('enriches image, venue, price, audience and summary from same-origin detail', async () => {
  const result = await enrichUTokyoEvent(event, { fetchImpl: async () => ({ ok: true, url: event.sourceUrl, text: async () => detail }) });
  assert.equal(result.enrichmentStatus, 'enriched');
  assert.equal(result.imageUrl, 'https://www.u-tokyo.ac.jp/content/poster.jpg');
  assert.equal(result.place, '東京大学 大講堂');
  assert.equal(result.price, '無料');
  assert.equal(result.audience, '社会人・一般');
  assert.match(result.description, /最新の成果/);
});

test('falls back without requesting cross-origin detail', async () => {
  let called = false;
  const result = await enrichUTokyoEvent({ ...event, sourceUrl: 'https://evil.example/detail' }, { fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.enrichmentStatus, 'fallback');
});

test('falls back on HTTP failures while preserving original event', async () => {
  const result = await enrichUTokyoEvent(event, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(result.enrichmentStatus, 'fallback');
  assert.equal(result.place, event.place);
});
