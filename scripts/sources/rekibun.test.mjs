import test from 'node:test';
import assert from 'node:assert/strict';
import { REKIBUN_HANDS_ON_URLS, mapRekibunPost, parseExhibitionPeriod, parseRekibunHandsOn, priceFor } from './rekibun.mjs';

const source = { name: '東京都歴史文化財団' };

const post = (acf, title = 'ルーシー・リー展―東西をつなぐ優美のうつわ―') => ({
  link: 'https://www.rekibun.or.jp/blog/benefits/lucie-rie/',
  title: { rendered: title },
  acf: { benefits_location: '東京都庭園美術館', benefits_date: '2026/07/4 (土) − 2026/09/13 (日)', url_link: 'https://www.teien-art-museum.ne.jp/exhibition/lucie-rie/', exhibition_type: 'discount', regular_price: { student_price: '1120', faculty_price: '1400' }, ...acf },
});

test('every real period format in the field parses', () => {
  // All four are verbatim from the live API; the separator is U+2212, not a hyphen.
  assert.deepEqual(parseExhibitionPeriod('2026/6/18(木)  − 2026/9/21(月・祝) '), { startDate: '2026-06-18', endDate: '2026-09-21' });
  assert.deepEqual(parseExhibitionPeriod('2026/7/23 (木) − 2026/10/7 (水)'), { startDate: '2026-07-23', endDate: '2026-10-07' });
  assert.deepEqual(parseExhibitionPeriod('2026/8/29（土）− 2026/12/6（日）'), { startDate: '2026-08-29', endDate: '2026-12-06' });
  assert.deepEqual(parseExhibitionPeriod('2026/07/4 (土) − 2026/09/13 (日)'), { startDate: '2026-07-04', endDate: '2026-09-13' });
});

test('a period with only one date yields a start and no end', () => {
  assert.deepEqual(parseExhibitionPeriod('2026/9/5 (土) 開催'), { startDate: '2026-09-05', endDate: null });
});

test('an unparseable period yields nothing rather than a guess', () => {
  assert.deepEqual(parseExhibitionPeriod('会期未定'), { startDate: null, endDate: null });
  assert.deepEqual(parseExhibitionPeriod(''), { startDate: null, endDate: null });
});

test('the adult price is used when the exhibition charges', () => {
  assert.equal(priceFor({ exhibition_type: 'discount', regular_price: { faculty_price: '1400' } }), '一般 ￥1400');
  assert.equal(priceFor({ exhibition_type: 'free', regular_price: { faculty_price: '' } }), '详见活动页');
  assert.equal(priceFor({}), '详见活动页');
});

test('a post maps to an event pointing at the museum, not the foundation', () => {
  const event = mapRekibunPost(post(), source);
  assert.equal(event.startDate, '2026-07-04');
  assert.equal(event.endDate, '2026-09-13');
  assert.equal(event.place, '東京都庭園美術館');
  assert.equal(event.attribution, '東京都庭園美術館');
  assert.equal(event.price, '一般 ￥1400');
  // The point of the operator route: the link goes to the venue's own page.
  assert.equal(event.sourceUrl, 'https://www.teien-art-museum.ne.jp/exhibition/lucie-rie/');
});

test('a leading space in the venue field does not survive', () => {
  assert.equal(mapRekibunPost(post({ benefits_location: ' 東京都庭園美術館' }), source).place, '東京都庭園美術館');
});

test('WordPress entity escapes are decoded in titles', () => {
  const event = mapRekibunPost(post({}, 'Kids &#038; Art &amp; Design'), source);
  assert.equal(event.title, 'Kids & Art & Design');
});

test('markup in a rendered title is stripped', () => {
  assert.equal(mapRekibunPost(post({}, '<em>共時的星叢</em>'), source).title, '共時的星叢');
});

test('without a usable period the post is dropped', () => {
  assert.equal(mapRekibunPost(post({ benefits_date: '会期未定' }), source), null);
});

test('without a museum link the foundation post stands in', () => {
  assert.equal(mapRekibunPost(post({ url_link: '' }), source).sourceUrl, 'https://www.rekibun.or.jp/blog/benefits/lucie-rie/');
});

test('exhibitions are tagged as art so the filter recognises them', () => {
  assert.equal(mapRekibunPost(post(), source).vibe, '艺术现场');
});

/* ---- アート・カルチャー体験100 -------------------------------------------- */

const handsOnPage = `<html><body><ul class="list1">
<li class="11915"><a href="https://www.teien-art-museum.ne.jp/event/signs-beyond/" target="_blank"><span class="place">東京都庭園美術館</span><span class="date">2026/08/25 &#8211; 2026/09/13</span><span class="txt">正門横スペースにおける特別展示　「ランドスケープをつくる」展</span><span class="genre113">展示</span></a></li>
<li class="11602"><a href="https://www.edo-tokyo-museum.or.jp/education/event/11712/" target="_blank"><span class="place">東京都江戸東京博物館</span><span class="date">2026/08/28</span><span class="txt">ミュージアムトーク</span><span class="genre110">トーク・講座</span></a></li>
<li class="11603"><a href="https://www.edo-tokyo-museum.or.jp/education/event/11712/" target="_blank"><span class="place">東京都江戸東京博物館</span><span class="date">2026/08/28</span><span class="txt">ミュージアムトーク</span><span class="genre110">トーク・講座</span></a></li>
<li class="11604"><a href="https://x.test/no-date/"><span class="place">東京文化会館</span><span class="date">日程未定</span><span class="txt">日付のない催し</span><span class="genre107">ワークショップ</span></a></li>
</ul></body></html>`;

test('hands-on listing yields venue, period, genre and the venue link', () => {
  const events = parseRekibunHandsOn(handsOnPage, source);
  assert.equal(events.length, 2, 'the duplicate and the undated item are dropped');
  const [exhibition, talk] = events;
  assert.equal(exhibition.startDate, '2026-08-25');
  assert.equal(exhibition.endDate, '2026-09-13');
  assert.equal(exhibition.place, '東京都庭園美術館');
  assert.equal(exhibition.category, '展示');
  // The listing links straight out to the venue running the programme.
  assert.equal(exhibition.sourceUrl, 'https://www.teien-art-museum.ne.jp/event/signs-beyond/');
  assert.equal(talk.startDate, '2026-08-28');
  assert.ok(!('endDate' in talk), 'a single-day item has no end date');
});

test('the en dash here and the minus sign in the exhibition feed both parse', () => {
  // Same operator, two different separators — hence reading dates positionally.
  const [event] = parseRekibunHandsOn(handsOnPage, source);
  assert.equal(event.startDate, '2026-08-25');
  assert.equal(parseExhibitionPeriod('2026/8/29（土）− 2026/12/6（日）').startDate, '2026-08-29');
});

test('the genre label is kept, not the taxonomy id in the class name', () => {
  const [, talk] = parseRekibunHandsOn(handsOnPage, source);
  assert.equal(talk.category, 'トーク・講座');
});

test('a page past the end parses to nothing rather than throwing', () => {
  assert.deepEqual(parseRekibunHandsOn('<html><body><ul class="list1"></ul></body></html>', source), []);
  assert.deepEqual(parseRekibunHandsOn('<html><body></body></html>', source), []);
});

test('the page list covers the full horizon and starts at the unpaged URL', () => {
  assert.ok(REKIBUN_HANDS_ON_URLS.length >= 12);
  assert.equal(REKIBUN_HANDS_ON_URLS[0], 'https://www.rekibun.or.jp/hands_on_events/');
  assert.equal(REKIBUN_HANDS_ON_URLS[1], 'https://www.rekibun.or.jp/hands_on_events/page/2/');
  assert.equal(new Set(REKIBUN_HANDS_ON_URLS).size, REKIBUN_HANDS_ON_URLS.length);
});
