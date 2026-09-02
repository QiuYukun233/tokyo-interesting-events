import test from 'node:test';
import assert from 'node:assert/strict';
import { ENTABE_URLS, parseEntabe, parseEntabeDates, classifyEntabe } from './entabe.mjs';

const today = new Date('2026-09-02T09:00:00+09:00');
const source = { name: 'えん食べ', today };

const item = ({
  id = '61384', slug = 'summary-starbucks-2026-september-new-foods',
  title = '【2026年9月最新版】スターバックス 季節のおすすめフードまとめ「マロンパウンドケーキ」など',
  summary = 'スターバックスで販売されている「マロンパウンドケーキ」など季節のおすすめフードをまとめてご紹介します。',
  category = 'ケーキ', buzz = '', rank = null,
} = {}) => `
<a href="https://entabe.jp/${id}/${slug}" class="news-index-latest clearfix">
  ${rank ? `<div class="side-corner-tag-rank pull-left"><p><span class="rank4"> ${rank} </span></p>` : ''}
  <img src="https://image.entabe.jp/upload/articles/${id}/x_special.jpg" loading="lazy" alt="${title}" class="thumbnail lazy ">
  ${rank ? '</div>' : ''}
  <p class="related-title related-title-over">
    ${title}
  </p>
  ${summary ? `<p class="related-summary hidden-phone">\n\t${summary}\n</p>` : ''}
  <div class="clearfix index-last-line2">
    <div class="line-buzz-count">${buzz}</div>
    <div class="line-category">
      ${category}
    </div>
  </div>
</a>`;

const page = (main, side = []) => `<html><body><div class="container"><div class="row">
<div class="span8"><ul class="nav nav-pills nav-stacked list-pc"><li class="related-li">${main.join('\n')}</li></ul>
<div class="pagination pagination-centered"><ul><li class="current">1</li><li><a href="/news/gourmet/page:2">2</a></li></ul></div></div>
<div class="span4 nav1"><div class="side"><ul class="nav nav-pills nav-stacked"><li class="related-li">${side.join('\n')}</li></ul></div></div>
</div></div></body></html>`;

test('URL list: first page is bare, the rest use the page:N form (?page=N is ignored by the site)', () => {
  assert.equal(ENTABE_URLS.length, 10);
  assert.equal(ENTABE_URLS[0], 'https://entabe.jp/news/gourmet');
  assert.equal(ENTABE_URLS[1], 'https://entabe.jp/news/gourmet/page:2');
  assert.equal(ENTABE_URLS[9], 'https://entabe.jp/news/gourmet/page:10');
  assert.ok(ENTABE_URLS.every((url) => !url.includes('?page=')));
});

test('dates: day-level launch dates in the title, with and without a year', () => {
  assert.deepEqual(parseEntabeDates('【9月8日～発売】セブン 新商品', { today }), { startDate: '2026-09-08', endDate: null, resolution: 'day' });
  assert.deepEqual(parseEntabeDates('【9月1日発売】ローソン 新商品パン', { today }), { startDate: '2026-09-01', endDate: null, resolution: 'day' });
  assert.deepEqual(parseEntabeDates('2026年10月3日に発売', { today }), { startDate: '2026-10-03', endDate: null, resolution: 'day' });
  assert.deepEqual(parseEntabeDates('9/1から順次開催！売りつくしセール', { today }), { startDate: '2026-09-01', endDate: null, resolution: 'day' });
});

test('dates: ranges and まで give an end date; a bare まで anchors the start to the 1st', () => {
  assert.deepEqual(parseEntabeDates('【コストコ】8/31〜9/27まで！セール', { today }), { startDate: '2026-08-31', endDate: '2026-09-27', resolution: 'day' });
  assert.deepEqual(parseEntabeDates('8/31〜9/27大人気定番商品が500円引き', { today }), { startDate: '2026-08-31', endDate: '2026-09-27', resolution: 'day' });
  assert.deepEqual(parseEntabeDates('9月8日～10月31日の期間限定', { today }), { startDate: '2026-09-08', endDate: '2026-10-31', resolution: 'day' });
  assert.deepEqual(parseEntabeDates('9月30日まで東京都内のホテルで楽しめるかき氷', { today }), { startDate: '2026-09-01', endDate: '2026-09-30', resolution: 'month' });
});

test('dates: month-only and season-only fall back to the first day and say so', () => {
  assert.deepEqual(parseEntabeDates('【2026年9月】サーティワン 期間限定フレーバー13種', { today }), { startDate: '2026-09-01', endDate: null, resolution: 'month' });
  assert.deepEqual(parseEntabeDates('9月はまだ暑い 残暑のかき氷4選', { today }), { startDate: '2026-09-01', endDate: null, resolution: 'month' });
  assert.deepEqual(parseEntabeDates('【2026年秋】ホテルのアフタヌーンティー特集', { today }), { startDate: '2026-09-01', endDate: null, resolution: 'season' });
  assert.deepEqual(parseEntabeDates('オリーブの丘のパスタを食べてみた', { today }), { startDate: null, endDate: null, resolution: null });
});

test('dates: a month far behind today without a year rolls into next year; an explicit year wins', () => {
  assert.equal(parseEntabeDates('【1月15日発売】新作', { today }).startDate, '2027-01-15');
  assert.equal(parseEntabeDates('【8月15日発売】新作', { today }).startDate, '2026-08-15');
  assert.equal(parseEntabeDates('2025年1月15日発売', { today }).startDate, '2025-01-15');
  // Month-level dates never roll forward: they describe "now-ish", not a launch.
  assert.equal(parseEntabeDates('6月に食べてみた白桃杏仁豆腐', { today }).startDate, '2026-06-01');
});

test('dates: numbers that are not dates (kcal, yen, counts) are ignored', () => {
  assert.deepEqual(parseEntabeDates('500kcal以下の新作弁当4選、1000円引き、13種、1.5倍', { today }), { startDate: null, endDate: null, resolution: null });
});

test('classification: shelf retail in the title drops, dine-in chains and venue types keep', () => {
  assert.deepEqual(classifyEntabe({ title: '【9月8日～発売】セブン-イレブン 新商品スイーツまとめ' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【9月1日～発売】セブン・ファミマ・ローソン新作スイーツ特集' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【カルディ】9/1から順次開催！売りつくしセール', summary: '店頭商品が10パーセントオフに' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【コストコ 】8/31〜9/27まで！セール情報まとめ' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【2026年9月】注目お弁当最新情報特集！ほっかほっか亭・ほっともっと・ワタミの宅食' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【2026年9月】サーティワン 9月の期間限定フレーバー13種まとめ' }), { keep: true, brand: 'サーティワン' });
  assert.deepEqual(classifyEntabe({ title: '【2026年9月】シャインマスカットアフタヌーンティー！ホテル4選', summary: '東京都内のホテルアフタヌーンティー4選' }), { keep: true, brand: null });
  // A maker round-up that names one dine-in chain: the chain is the place.
  assert.deepEqual(classifyEntabe({ title: '【2026年9月発売】さつまいもスイーツ新商品まとめ！コメダ珈琲店「お月見シロノワール」・ロッテ「生 チョコパイ」' }), { keep: true, brand: 'コメダ珈琲店' });
  // Packaged goods from makers with no venue anywhere: nothing to go to.
  assert.deepEqual(classifyEntabe({ title: '【2026年9月】注目ドリンク最新情報特集！カゴメ・リプトン・カルピス', summary: 'カゴメ、リプトン、アサヒ飲料から話題のドリンクが続々登場' }), { keep: false, brand: null });
  assert.deepEqual(classifyEntabe({ title: '【2026年9月発売】菓子パン新商品まとめ「生おいもあんぱん」', summary: '2026年9月1日に発売される菓子パン新商品' }), { keep: false, brand: null });
});

test('parses one kept listing item into a candidate with brand place, category and a month-fallback note', () => {
  const [event] = parseEntabe(page([item()]), source);
  assert.equal(event.title, '【2026年9月最新版】スターバックス 季節のおすすめフードまとめ「マロンパウンドケーキ」など');
  assert.equal(event.sourceUrl, 'https://entabe.jp/61384/summary-starbucks-2026-september-new-foods');
  assert.equal(event.startDate, '2026-09-01');
  assert.equal(event.endDate, undefined);
  assert.equal(event.place, 'スターバックス 都内店舗');
  assert.equal(event.category, 'ケーキ');
  assert.equal(event.source, 'えん食べ');
  assert.match(event.description, /^スターバックスで販売されている/);
  assert.match(event.description, /日期只到月/);
  assert.equal(event.popularity, undefined);
});

test('a day-level launch date carries no precision note; まで becomes endDate; buzz count is popularity', () => {
  const html = page([item({
    id: '1', title: '【9月8日～発売】コメダ珈琲店 秋の新作「お月見シロノワール」9月30日まで',
    summary: 'コメダ珈琲店で9月8日から期間限定で販売。', category: 'カフェ', buzz: '12',
  })]);
  const [event] = parseEntabe(html, source);
  assert.equal(event.startDate, '2026-09-08');
  assert.equal(event.endDate, '2026-09-30');
  assert.equal(event.place, 'コメダ珈琲店 都内店舗');
  assert.equal(event.popularity, 12);
  assert.doesNotMatch(event.description, /日期只到/);
});

test('a generic venue match without a known chain gets a generic Tokyo place', () => {
  const [event] = parseEntabe(page([item({
    id: '2', title: '【東京・ホテルかき氷】9月もまだ暑い！ご褒美かき氷4選',
    summary: '9月30日まで東京都内のホテルで楽しめるご褒美かき氷4選を紹介します。', category: 'ホテル',
  })]), source);
  assert.equal(event.place, '东京都内 · 详见记事');
  assert.equal(event.startDate, '2026-09-01');
  assert.equal(event.endDate, '2026-09-30');
});

test('drops: convenience stores, maker round-ups, undated reviews; sidebar ranking duplicates are skipped', () => {
  const kept = item({ id: '10', title: '【2026年9月】注目カフェ最新情報特集！スターバックス・プロント・ベローチェ', category: 'カフェ' });
  const html = page([
    item({ id: '11', title: '【9月1日発売】ファミリーマート 新商品弁当まとめ', category: '弁当' }),
    item({ id: '12', title: '【2026年9月発売】菓子パン新商品まとめ「生おいもあんぱん」', summary: '2026年9月1日に発売される菓子パン新商品', category: '菓子パン' }),
    item({ id: '13', title: '【オリーブの丘実食】ベーコンと焼き茄子のパスタを食べてみた', summary: 'オリーブの丘のパスタメニューを実際に食べてみました。', category: 'パスタ' }),
    kept,
  ], [
    item({ id: '10', title: '【2026年9月】注目カフェ最新情報特集！スターバックス・プロント・ベローチェ', category: 'ファミレス・外食チェーン', rank: '1' }),
    item({ id: '14', title: '【2026年9月】デニーズ お月見フェア', category: 'ファミレス', rank: '2' }),
  ]);
  const events = parseEntabe(html, source);
  assert.deepEqual(events.map((e) => e.sourceUrl), ['https://entabe.jp/10/summary-starbucks-2026-september-new-foods']);
  assert.equal(events[0].category, 'カフェ');
});

test('an empty page (past the end) yields no candidates', () => {
  assert.deepEqual(parseEntabe(page([]), source), []);
});
