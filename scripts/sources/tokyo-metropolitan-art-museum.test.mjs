import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTokyoMetropolitanArtMuseum } from './tokyo-metropolitan-art-museum.mjs';

const source = { name: 'Tokyo Metropolitan Art Museum', url: 'https://www.tobikan.jp/exhibition/' };
const fixture = `<section><div class="section-header"><h2 class="section-header-title">開催中の展覧会</h2></div><ul><li><a class="exhibition-item" href="2026_views.html"><p class="-category"><span>企画展</span><span>無料</span></p><p class="-title">この場所の風景<br>上野・大牟田</p><p class="-period">2026年7月23日(木)～10月7日(水)</p></a></li></ul></section><section><h2 class="section-header-title">過去の展覧会</h2><a class="exhibition-item" href="old.html"><p class="-title">過去展</p><p class="-period">2025年1月1日～2025年1月2日</p></a></section>`;

test('keeps only current/upcoming cards and inherits the omitted end-date year', () => {
  const [event] = parseTokyoMetropolitanArtMuseum(fixture, source);
  assert.equal(event.title, 'この場所の風景 上野・大牟田');
  assert.equal(event.startDate, '2026-07-23');
  assert.equal(event.endDate, '2026-10-07');
  assert.equal(event.category, '企画展無料');
  assert.equal(event.description, '企画展無料');
  assert.equal(event.sourceUrl, 'https://www.tobikan.jp/exhibition/2026_views.html');
});
