import test from 'node:test';
import assert from 'node:assert/strict';
import { editionBase, editionPostsUrl, normaliseAddress, parseFactory } from './oota-open-factory.mjs';

const source = { name: 'おおたオープンファクトリー2025', year: 2025, startDate: '2026-08-29' };

const page = ({
  name = 'ウェディア',
  area = '新田丸・蒲田エリア',
  address = '大田区下丸子4-19-20',
  work = 'シルクプリントでTシャツなどの衣料品を作成しています。',
  product = 'Tシャツ、トートBag、パーカー等',
  site = 'https://www.wedia-t.com/',
  phone = '03-3750-6192',
} = {}) => `<html><head><title>${name} | おおたオープンファクトリー2025</title></head><body>
  <div class="l-title factory">${name}<span>${area}</span></div>
  <dl>
    ${work ? `<dt>日ごろの業務内容</dt><dd>${work}</dd>` : ''}
    ${product ? `<dt>出来上がる製品</dt><dd>${product}</dd>` : ''}
  </dl>
  <table><tbody>
    <tr><th scope="row">開催時間</th><td>10:00～16:00</td></tr>
    ${site ? `<tr><th>会社URL</th><td><a href="${site}" target="_blank"><span>${site}</span></a></td></tr>` : ''}
    ${address ? `<tr><th scope="row">住所</th><td><a href="https://www.google.com/maps/search/?api=1&query=35.57,139.68" class="btn02"><span>${address}</span></a></td></tr>` : ''}
    ${phone ? `<tr><th>電話番号</th><td><a href="tel:0337506192"><span>${phone}</span></a></td></tr>` : ''}
    <tr><th>FAX番号</th><td>03-3750-6396</td></tr>
  </tbody></table>
</body></html>`;

test('a workshop becomes a place candidate with its address and area', () => {
  const event = parseFactory(page(), source, 'https://o-2.jp/mono/oof2025/7720/');
  assert.equal(event.title, 'ウェディア');
  assert.equal(event.place, '東京都大田区下丸子4-19-20（新田丸・蒲田エリア）');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true, 'a workshop has no closing day');
  assert.equal(event.endDate, undefined);
  assert.equal(event.category, '町工場');
  assert.match(event.description, /シルクプリント/);
  assert.match(event.description, /作るもの：Tシャツ/);
});

test('the prefecture is restored, because this site omits it', () => {
  // Every address here reads 「大田区…」. A startsWith('東京都') filter — how the
  // other shop sources work — would reject all of them.
  assert.equal(normaliseAddress('大田区下丸子4-19-20'), '東京都大田区下丸子4-19-20');
  assert.equal(normaliseAddress('東京都大田区下丸子4-19-20'), '東京都大田区下丸子4-19-20');
  assert.equal(normaliseAddress('川崎市幸区1-2-3'), '東京都川崎市幸区1-2-3');
  assert.equal(normaliseAddress('神奈川県川崎市1-2'), '神奈川県川崎市1-2');
  assert.equal(normaliseAddress(''), null);
  assert.equal(normaliseAddress('準備中'), null);
});

test('the address is read from the link text, not the map URL behind it', () => {
  const event = parseFactory(page(), source);
  assert.ok(!/google|query=|35\.57/.test(event.place), event.place);
});

test("the company's own site is preferred over the fair's detail page", () => {
  assert.equal(parseFactory(page(), source, 'https://o-2.jp/mono/oof2025/7720/').sourceUrl, 'https://www.wedia-t.com/');
  assert.equal(parseFactory(page({ site: '' }), source, 'https://o-2.jp/mono/oof2025/7720/').sourceUrl, 'https://o-2.jp/mono/oof2025/7720/');
  assert.equal(parseFactory(page({ site: '' }), source).sourceUrl, editionBase(2025));
});

test('a workshop with no address is not a destination', () => {
  assert.equal(parseFactory(page({ address: '' }), source), null);
});

test('phone and fax never reach the candidate', () => {
  const event = parseFactory(page(), source);
  const blob = JSON.stringify(event);
  assert.ok(!/3750-6192|3750-6396|tel:/.test(blob), blob);
});

test('a workshop with no prose still becomes a candidate', () => {
  const event = parseFactory(page({ work: '', product: '' }), source);
  assert.ok(event);
  assert.ok(!('description' in event));
});

test('the REST enumeration URL points at the edition, asking only for what is used', () => {
  assert.equal(editionPostsUrl(2025), 'https://www.o-2.jp/mono/oof2025/wp-json/wp/v2/posts?per_page=100&_fields=id,link,title');
});

test('a workshop listing several sites keeps the first, which is where visitors go', () => {
  // 白洋舍 lists ① the factory the tour visits and ② its laundry museum. The
  // circled marker made the whole cell unparseable, so it was dropped as
  // "no address" while in fact publishing two.
  assert.equal(
    normaliseAddress('① 大田区下丸子2-11-1（多摩川工場）※工場見学ツアー住所 ② 大田区下丸子2-11-8（五十嵐健治記念洗濯資料館）'),
    '東京都大田区下丸子2-11-1（多摩川工場）',
  );
});

test('an ordinary single address is untouched by the multi-site handling', () => {
  assert.equal(normaliseAddress('大田区下丸子4-19-20'), '東京都大田区下丸子4-19-20');
});

test('a labelled address value is unwrapped, not double-prefixed', () => {
  // 北嶋絞製作所 writes 「【開催場所】東京都大田区…」. Left as-is the prefecture
  // test fails and the result reads 東京都【開催場所】東京都大田区….
  assert.equal(
    normaliseAddress('【開催場所】東京都大田区下丸子1丁目5−19 小林運送有限会社内'),
    '東京都大田区下丸子1丁目5−19 小林運送有限会社内',
  );
});
