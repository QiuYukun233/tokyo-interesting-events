import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTheatre, YOSHIMOTO_FEED_URL, YOSHIMOTO_VENUES, mapYoshimotoRow, yoshimotoUrl } from './yoshimoto.mjs';

const source = { name: '渋谷よしもと漫才劇場', place: '渋谷', origin: 'https://shibuya-manzaigekijyo.yoshimoto.co.jp' };

/** A trimmed real row from the feed, shape verified 2026-08-28. */
const row = (extra = {}) => ({
  id: 18721,
  venue: 'YOSHIMOTO ROPPONGI THEATER',
  name: '六本木ネオン〜ロングコートダディ×ダンビラムーチョ×カベポスター〜',
  date: '2026/08/27',
  dateTime1: '18:00',
  dateTime2: '18:15',
  dateTime3: '19:15',
  member: 'ロングコートダディ／ダンビラムーチョ／カベポスター／MC：kento fukaya',
  price1: '\\2,800',
  price2: '\\3,300',
  url1: 'https://ticket.fany.lol/event/detail/18134/47714',
  url2: 'https://online-ticket.yoshimoto.co.jp/products/x',
  url3: 'https://feed-cdn.yoshimoto.co.jp/img/poster/x.jpg',
  url4: null,
  ...extra,
});

test('the feed URL carries the venue id and a bounded date window, not an open-ended one', () => {
  const now = new Date('2026-08-28T00:00:00+09:00');
  const url = new URL(yoshimotoUrl('roppongi', now));
  assert.equal(url.searchParams.get('theater'), 'roppongi');
  assert.equal(url.searchParams.get('venue'), '01');
  assert.equal(url.searchParams.get('date_from'), '20260828');
  const to = url.searchParams.get('date_to');
  assert.ok(to > '20260828' && to <= '20261027', to);
});

test('a row maps to a candidate with the venue, date and price', () => {
  const event = mapYoshimotoRow(row(), source);
  assert.equal(event.title, '六本木ネオン〜ロングコートダディ×ダンビラムーチョ×カベポスター〜');
  assert.equal(event.startDate, '2026-08-27');
  assert.equal(event.place, '渋谷よしもと漫才劇場 · 渋谷');
  assert.equal(event.time, '18:00〜18:15');
  assert.equal(event.price, '￥2,800 / ￥3,300');
  assert.equal(event.category, 'お笑い・漫才');
});

test('the performer lineup is kept as the "why go" for a manzai bill', () => {
  const event = mapYoshimotoRow(row(), source);
  assert.match(event.description, /ロングコートダディ/);
});

test('the official ticket link (url2) is preferred over the resale marketplace (url1)', () => {
  const event = mapYoshimotoRow(row(), source);
  assert.equal(event.sourceUrl, 'https://online-ticket.yoshimoto.co.jp/products/x');
});

test('without an official ticket link the resale link still gets you to the show', () => {
  const event = mapYoshimotoRow(row({ url2: null }), source);
  assert.equal(event.sourceUrl, 'https://ticket.fany.lol/event/detail/18134/47714');
});

test('a row with neither link falls back to the venue site rather than being dropped silently', () => {
  const event = mapYoshimotoRow(row({ url1: null, url2: null }), source);
  assert.equal(event.sourceUrl, source.origin);
});

test('a row with no date is dropped rather than guessed', () => {
  assert.equal(mapYoshimotoRow(row({ date: null }), source), null);
});

test('a row with no title is dropped', () => {
  assert.equal(mapYoshimotoRow(row({ name: '' }), source), null);
});

test('a very long member list is capped rather than flooding the card', () => {
  const long = Array.from({ length: 60 }, (_, i) => `芸人${i}`).join('／');
  const event = mapYoshimotoRow(row({ member: long }), source);
  assert.ok(event.description.length <= 300);
});

test('four Tokyo venues are registered, each with a distinct theater id', () => {
  assert.equal(YOSHIMOTO_VENUES.length, 4);
  assert.equal(new Set(YOSHIMOTO_VENUES.map((venue) => venue.theater)).size, 4);
  assert.ok(YOSHIMOTO_FEED_URL.startsWith('https://feed-api.yoshimoto.co.jp/'));
});

test('a theatre folds into one candidate, not one per performance', () => {
  // 220 bills at one venue are not 220 questions: nobody decides 220 times
  // whether ルミネtheよしもと is worth going to. 方案 §4.3, on the time axis.
  const bills = [
    { id: '1', title: 'よしもと漫才劇場 1部', startDate: '2026-09-01', description: 'ロングコートダディ、ダンビラムーチョ' },
    { id: '2', title: 'よしもと漫才劇場 2部', startDate: '2026-09-01', description: 'GAG、ニッポンの社長' },
    { id: '3', title: 'お笑いライブ', startDate: '2026-09-02', description: 'ロングコートダディ' },
  ];
  const [venue] = aggregateTheatre(bills, { name: 'ルミネtheよしもと', place: '新宿' });
  assert.equal(venue.title, 'ルミネtheよしもと');
  assert.equal(venue.place, '新宿 · ルミネtheよしもと');
  assert.equal(venue.startDate, '2026-09-01', 'the run starts on its earliest bill');
  assert.equal(venue.ongoing, true, 'a standing theatre has no end date');
  assert.equal(venue.changeType, 'discovery');
  assert.match(venue.description, /2日間で3公演/);
});

test('the performers are deduped into the card', () => {
  const bills = [
    { id: '1', title: 'a', startDate: '2026-09-01', description: 'GAG、ニッポンの社長' },
    { id: '2', title: 'b', startDate: '2026-09-01', description: 'GAG' },
  ];
  const [venue] = aggregateTheatre(bills, { name: 'x' });
  const listed = venue.description.match(/出演：(.*)ほか/)[1];
  assert.equal(listed.split('、').filter((name) => name === 'GAG').length, 1);
});

test('an empty feed yields no candidate rather than an empty theatre', () => {
  // Between seasons the feed can come back empty; that is "nothing on", not a
  // theatre with zero performances.
  assert.deepEqual(aggregateTheatre([], { name: 'x' }), []);
});

test('the aggregate never emits the individual bills', () => {
  const bills = Array.from({ length: 50 }, (_, index) => ({ id: `${index}`, title: `bill ${index}`, startDate: '2026-09-01' }));
  assert.equal(aggregateTheatre(bills, { name: 'x' }).length, 1);
});

test('bill labels are stripped so the card lists performers, not markup', () => {
  // The feed writes 「[企画ライブ]ケビンス」 and 「もう中学生／ゲスト：蛙亭」.
  // Left as-is, the card advertises 「[企画ライブ]ケビンス」 as a performer.
  const bills = [
    { id: '1', title: 'a', startDate: '2026-09-01', description: '[企画ライブ]ケビンス、ほか' },
    { id: '2', title: 'b', startDate: '2026-09-01', description: 'もう中学生／ゲスト：蛙亭' },
  ];
  const [venue] = aggregateTheatre(bills, { name: 'x' });
  assert.ok(!/[[\]]|ゲスト：/.test(venue.description), venue.description);
  assert.match(venue.description, /ケビンス/);
  assert.match(venue.description, /蛙亭/);
  assert.ok(!/、ほか。?出演/.test(venue.description));
});
