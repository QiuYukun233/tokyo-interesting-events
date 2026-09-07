import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBunkyoNaruse, parseHamaRikyuNight, parseIriTokyoOpenDay, parseTmpcRoadTour } from './special-access.mjs';

test('IRI open day requires walk-in public access and concrete lab experiences', () => {
  const html = '<main><h1>親子で楽しむ「本部一般公開2026」開催</h1><p>開催日時 | 2026年9月12日 土曜日 10時00分～16時30分</p><p>参加費 | 無料</p><p>参加申込 | 当日参加も可能</p><p>普段は入れない実験室。金属3Dプリンター、走査電子顕微鏡、サービスロボット、IoT展示。</p></main>';
  const [row] = parseIriTokyoOpenDay(html, { name: 'IRI', url: 'https://www.iri-tokyo.jp/x' });
  assert.equal(row.startDate, '2026-09-12');
  assert.equal(row.changeType, 'special_access');
  assert.match(row.description, /扫描电子显微镜/);
});

test('IRI rejects an ordinary business presentation', () => {
  assert.deepEqual(parseIriTokyoOpenDay('<main><h1>本部一般公開2026</h1><p>開催日時 | 2026年9月12日</p><p>参加費 | 無料</p><p>企業向け研究発表会</p></main>'), []);
});

test('TMP road tour reads only the active participant recruitment block', () => {
  const html = '<section><h2>お知らせ</h2><p>環八 井荻トンネル見学ツアーの当選通知</p></section><section><h2>参加者募集</h2><strong>「歩いて巡る！隅田川橋梁・復興記念館見学ツアー」の参加者を募集します！</strong><p>開催日：令和8年10月16日（金）</p><a href="/06_info/dourokengaku/recruit.html">お申込みはこちら</a></section>';
  const [row] = parseTmpcRoadTour(html, { origin: 'https://www.tmpc.or.jp' });
  assert.equal(row.startDate, '2026-10-16');
  assert.equal(row.sourceUrl, 'https://www.tmpc.or.jp/06_info/dourokengaku/recruit.html');
});

test('Naruse hall requires both normally closed and a live application deadline', () => {
  const html = '<main id="tmp_contents"><h1>東京文化財ウィーク2026「日本女子大学成瀬記念講堂」の特別公開 参加者募集</h1><p>明治39年築。通常非公開のところ、建物内部を特別に公開します。</p><h4>日時</h4><p>令和8年10月8日（木曜日）</p><h4>申込締切</h4><p>令和8年9月27日（日曜日）必着</p></main>';
  const [row] = parseBunkyoNaruse(html);
  assert.equal(row.startDate, '2026-10-08');
  assert.equal(row.category, '通常非公开建筑');
});

test('Hama-Rikyu announcement becomes two distinct nights, not its subprograms', () => {
  const html = '<main><h1>夜間の開園時間延長のお知らせ</h1><p>浜離宮でお月見散歩</p><p>令和8年10月21日（水）～23日（金）</p><p>令和8年10月30日（金）～11月3日（火）</p><p>夜間の開園時間延長。通常の入園料のみ。</p></main>';
  const rows = parseHamaRikyuNight(html);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.endDate), ['2026-10-23', '2026-11-03']);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.match(rows[0].sourceUrl, /#moon-viewing$/);
});

