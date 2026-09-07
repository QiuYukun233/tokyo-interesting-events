import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJapaneseRange, parseTokyoParkEvents } from './tokyo-park-events.mjs';

test('parses Reiwa and inherited-year Japanese date ranges', () => {
  assert.deepEqual(parseJapaneseRange('令和８年10月21日（水）～23日（金）'), {
    startDate: '2026-10-21', endDate: '2026-10-23',
  });
  assert.deepEqual(parseJapaneseRange('2026年11月25日(水)～12月6日(日)'), {
    startDate: '2026-11-25', endDate: '2026-12-06',
  });
});

test('keeps only distinctive park experiences with a concrete date and place', () => {
  const html = `<ul>
    <li><div><div class="detail"><h3><a href="/event_search/night.html">浜離宮でお月見散歩</a></h3>
      <p class="date">令和８年10月21日（水）～23日（金）</p><div class="spot-list"><a class="spot">浜離宮恩賜庭園</a></div></div></div></li>
    <li><div><div class="detail"><h3><a href="/ordinary.html">秋のバラ展</a></h3>
      <p class="date">2026年10月1日</p><div class="spot-list"><a class="spot">神代植物公園</a></div></div></div></li>
    <li><div><div class="detail"><h3><a href="/undated.html">夜間特別開園</a></h3>
      <div class="spot-list"><a class="spot">六義園</a></div></div></div></li>
  </ul>`;
  const rows = parseTokyoParkEvents(html, { name: 'Parks', origin: 'https://www.tokyo-park.or.jp' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceUrl, 'https://www.tokyo-park.or.jp/event_search/night.html');
  assert.equal(rows[0].endDate, '2026-10-23');
});

test('repairs malformed nested paragraph date markup', () => {
  const html = `<li><div><div class="detail"><h3><a href="/umbrella.html">【都立9庭園】和傘で庭園めぐり</a></h3>
    <p class="date"></p><p>令和8年7月11日（土）～9月27日（日）</p>
    <div class="spot-list"><a class="spot">旧岩崎邸庭園</a></div></div></div></li>`;
  const [row] = parseTokyoParkEvents(html);
  assert.equal(row.startDate, '2026-07-11');
  assert.equal(row.endDate, '2026-09-27');
});

test('a special opening is marked for nowness ranking', () => {
  const html = `<li><div><div class="detail"><h3><a href="/once.html">通常非公開の茶室を特別公開</a></h3>
    <p class="date">2026年11月3日</p><div class="spot-list"><a class="spot">小石川後楽園</a></div></div></div></li>`;
  const [row] = parseTokyoParkEvents(html);
  assert.equal(row.changeType, 'special_access');
});


