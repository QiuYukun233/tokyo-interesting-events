import test from 'node:test';
import assert from 'node:assert/strict';
import { YOSHIMOTO_FEED_URL, YOSHIMOTO_VENUES, mapYoshimotoRow, yoshimotoUrl } from './yoshimoto.mjs';

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
