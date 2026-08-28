import test from 'node:test';
import assert from 'node:assert/strict';
import { MINERAL_SHOW_PAGES, isInPrefecture, mapShop, pageApiUrl, parseAddress, parseMineralShowPage } from './tokyo-mineral-show.mjs';

const source = {
  name: '東京ミネラルショー2026',
  link: 'https://www.tokyomineralshow.com/exhibitor/list_ka/',
  startDate: '2026-08-28',
};

const pair = ({ name = '世界の化石販売 KASEKIYA', hall = '2', area = 'L', booth = 'B31', contact = '192-0355\n東京都八王子市堀之内2-6-1-110\n042-670-9494' } = {}) => `
<tr><td>${name}</td><td>${hall}</td><td>${area}</td><td>${booth}</td></tr>
<tr><td colspan="4">${contact}</td></tr>`;

const page = (...pairs) => `<table><tbody>
<tr><th class="campany">社名</th><th class="floor">会場</th><th class="area">エリア</th><th class="booth">ブースNo</th></tr>
<tr><th class="add" colspan="4">住所・電話番号</th></tr>
${pairs.join('')}</tbody></table>`;

test('a two-row exhibitor block becomes one shop with its address', () => {
  const [shop] = parseMineralShowPage(page(pair()), { label: 'か行' });
  assert.equal(shop.name, '世界の化石販売 KASEKIYA');
  assert.equal(shop.booth, 'B31');
  assert.equal(shop.address, '東京都八王子市堀之内2-6-1-110');
  assert.equal(shop.group, 'か行');
});

test('the postal code, phone and e-mail are stripped; only the address survives', () => {
  assert.equal(parseAddress('192-0355\n東京都八王子市堀之内2-6-1-110\n042-670-9494'), '東京都八王子市堀之内2-6-1-110');
  assert.equal(parseAddress('〒400-0083 山梨県甲府市平瀬町小平394-3 055-251-8032'), '山梨県甲府市平瀬町小平394-3');
});

test('an obfuscated e-mail is removed rather than decoded', () => {
  // The organiser wrote `☆` for `@` on purpose; working around that would
  // defeat a measure taken on the exhibitor's behalf.
  const address = parseAddress('336\n埼玉県さいたま市\nkazariya.akitsu3☆gmail.com');
  assert.equal(address, '埼玉県さいたま市');
  assert.ok(!/[@☆]/.test(address));
});

test('a building-and-room address is not mistaken for a phone number', () => {
  // `5-26-14-104` has the shape of a phone number but is a street address.
  assert.equal(parseAddress('110-0005 東京都台東区上野5-26-14-104'), '東京都台東区上野5-26-14-104');
  assert.equal(parseAddress('107-0062 東京都港区南青山5-4-44 ラポール青山54 Ｂ-105'), '東京都港区南青山5-4-44 ラポール青山54 Ｂ-105');
});

test('an exhibitor who published only a prefecture and city keeps that much', () => {
  assert.equal(parseAddress('400\n山梨県甲府市\nmail@garnetfans.jp'), '山梨県甲府市');
});

test('a contact cell with no recognisable prefecture yields no address', () => {
  assert.equal(parseAddress('Bangkok, Thailand'), null);
  assert.equal(parseAddress(''), null);
});

test('header and navigation rows are not read as exhibitors', () => {
  const shops = parseMineralShowPage(page(), { label: 'か行' });
  assert.deepEqual(shops, []);
});

test('a row whose contact cell is missing still parses, with no address', () => {
  const [shop] = parseMineralShowPage(`<table><tr><td>店A</td><td>1</td><td>R</td><td>10</td></tr></table>`, {});
  assert.equal(shop.name, '店A');
  assert.equal(shop.address, null);
});

test('the prefecture filter is what keeps this a Tokyo directory', () => {
  assert.equal(isInPrefecture('東京都八王子市堀之内2-6-1-110'), true);
  assert.equal(isInPrefecture('山梨県甲府市'), false);
  assert.equal(isInPrefecture(null), false);
  assert.equal(isInPrefecture('神奈川県横浜市', '神奈川県'), true);
});

test('a shop maps to a place candidate, not a dated event', () => {
  // changeType `discovery` is what lib/object-type.mjs reads as `place`; the
  // whole point of this source is that the shop outlives the fair.
  const [shop] = parseMineralShowPage(page(pair()), { label: 'か行' });
  const event = mapShop(shop, source);
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.place, '東京都八王子市堀之内2-6-1-110');
  assert.equal(event.category, '鉱物・化石・隕石の店');
  assert.match(event.why, /ブースB31/);
  // A shop has no end date; `ongoing` is what keeps it inside the horizon
  // filter, instead of the invented far-future endDate this used to write.
  assert.equal(event.ongoing, true);
  assert.equal(event.endDate, undefined);
});

test('a shop with no address is not turned into a place', () => {
  // Without an address there is nowhere to go, so it is not a destination.
  assert.equal(mapShop({ name: '店A', address: null }, source), null);
});

test('ids stay distinct even though every shop cites the same directory page', () => {
  const shops = parseMineralShowPage(page(pair(), pair({ name: '金森貿易', contact: '171-0044\n東京都豊島区千早2-42-6' })), {});
  const events = shops.map((shop, index) => mapShop(shop, source, index));
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
  assert.ok(events[0].sourceUrl.startsWith(source.link));
});

test('no candidate carries a phone number or e-mail address', () => {
  const shops = parseMineralShowPage(page(pair(), pair({ name: 'かざり屋あきつ', contact: '336\n東京都板橋区1-2-3\nkazariya☆gmail.com' })), {});
  for (const event of shops.map((shop, index) => mapShop(shop, source, index)).filter(Boolean)) {
    assert.ok(!/[@☆★＠]/.test(`${event.place} ${event.why} ${event.title}`), event.place);
  }
});

test('every 50音 page is registered once, with あ行 on the section index', () => {
  const slugs = MINERAL_SHOW_PAGES.map((page) => page.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs[0], 'exhibitor');
  assert.match(pageApiUrl('list_ka'), /wp-json\/wp\/v2\/pages\?slug=list_ka/);
});
