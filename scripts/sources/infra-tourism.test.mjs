import test from 'node:test';
import assert from 'node:assert/strict';
import { INFRA_TOURISM_URL, parseInfraTourism } from './infra-tourism.mjs';

const source = { name: 'インフラツーリズム（国交省）', startDate: '2026-09-02' };

const item = ({
  type = 'tokyo', facility = '東京国際空港第３ターミナル', tour = '羽田空港第３（国際線）ターミナル見学ツアー',
  address = '東京都大田区', kind = '空港', organizer = '民間主催',
  blurb = '普段は入れないバックヤードを巡ります。', when = '毎月1回実施（事前申込）<br>※詳細はHP参照',
  homepage = 'https://www.o-2.jp/event/terminal-guide2026-4-9/',
} = {}) => `
<li class="bl_searchResultBlock_item js_target" data-type=${type} data-theme=h data-organizer=b><div>
  <div class="s__title"><p class="s__timer" data-end-date="2024/3/1 00:00">NEW!</p><h3>${facility}</h3>
    <p class="s__place">${address}<span>${kind}</span></p><p class="s__syusai">${organizer}</p></div>
  <div class="s__contents"><div class="s__text"><h4>${tour}</h4><p>${blurb}</p>
    <p><b>&#x25fc;開催日/開催期間</b>：${when}</p>
    <p><b>&#x25fc;お問い合わせ先</b></p><p>大田観光協会<br>03-3734-0202</p>
    ${homepage ? `<p><a href="${homepage}"target=_blank>ホームページ</a></p>` : '<p class="s__nolink">ホームページなし</p>'}
  </div></div></div></li>`;

const page = (...items) => `<html><body><ul class="search_ul">${items.join('\n')}</ul></body></html>`;

test('a Tokyo tour becomes an ongoing place candidate with schedule text as time', () => {
  const [place] = parseInfraTourism(page(item()), source);
  assert.equal(place.title, '羽田空港第３（国際線）ターミナル見学ツアー');
  assert.equal(place.place, '東京国際空港第３ターミナル · 東京都大田区');
  assert.equal(place.time, '毎月1回実施（事前申込）※詳細はHP参照');
  assert.equal(place.startDate, '2026-09-02');
  assert.equal(place.ongoing, true);
  assert.equal(place.category, 'インフラ見学・空港');
  assert.equal(place.attribution, '民間主催');
  assert.equal(place.description, '普段は入れないバックヤードを巡ります。');
  assert.equal(place.sourceUrl, 'https://www.o-2.jp/event/terminal-guide2026-4-9/');
});

test('other prefectures are ignored and the same tour listed twice yields one candidate', () => {
  const html = page(item({ type: 'osaka', facility: '大和川亀の瀬' }), item(), item());
  const places = parseInfraTourism(html, source);
  assert.equal(places.length, 1);
});

test('no homepage falls back to the portal itself; その他 kind gives the bare category', () => {
  const [place] = parseInfraTourism(page(item({ homepage: '', kind: 'その他' })), source);
  assert.equal(place.sourceUrl, INFRA_TOURISM_URL);
  assert.equal(place.category, 'インフラ見学');
});

test('a facility without a tour title falls back to the facility name', () => {
  const [place] = parseInfraTourism(page(item({ tour: '' })), source);
  assert.equal(place.title, '東京国際空港第３ターミナル');
});
