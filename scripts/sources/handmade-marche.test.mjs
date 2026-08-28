import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDMADE_MARCHE_GENRES, discoverExhibitorIds, fetchCreator, parseAttendanceDate, parseCreatorPage, parseExhibitorIds } from './handmade-marche.mjs';

const source = { name: '東京ハンドメイドマルシェ2026秋', year: 2026, venue: '東京ドームシティ プリズムホール' };

const listPage = (...ids) => `<html><body><ul>${ids.map((id) => `
  <li><a href="/creators/?exhibitor_id=${id}"><img src="/user_files/x/800"></a></li>`).join('')}</ul></body></html>`;

const creatorPage = ({ name = 'ボタニカルライフ', genres = ['アクセサリー'], date = '9/6(日)', booth = 'A-05', sns = 'https://instagram.com/ayaka_botanicallife/' } = {}) => `
<html><body>
  <table>
    <tr><th>クリエイター名</th><td>${name}</td></tr>
    <tr><th>出店ジャンル</th><td><ul class="genreList">${genres.map((g) => `<li class="tag"><a href="/creators/list_creators/?genre=1">${g}</a></li>`).join('')}</ul></td></tr>
    <tr><th>SNS</th><td class="sns">${sns ? `<a target="_blank" href="${sns}"><img src="/images/icon.png"></a>` : ''}</td></tr>
  </table>
  <div id="boothLine"><ul class="date bold"><li>${date}</li></ul>
    <div id="boothNumber"><p class="bootNumberTxt">ブース番号：<span class="numberTxtEmphasis">${booth}</span></p></div>
  </div>
</body></html>`;

test('attendance dates without a year take the fair edition year from the caller', () => {
  assert.equal(parseAttendanceDate('9/6(日)', 2026), '2026-09-06');
  assert.equal(parseAttendanceDate('5/3(日)', 2027), '2027-05-03');
  assert.equal(parseAttendanceDate('未定', 2026), null);
  assert.equal(parseAttendanceDate('9/6(日)', undefined), null);
});

test('exhibitor ids are extracted from a listing page, deduped', () => {
  // Real ids are UUIDs (hex + dashes only) — the extraction regex matches that shape.
  const ids = parseExhibitorIds(listPage('aaaaaaaa-0000', 'bbbbbbbb-1111', 'aaaaaaaa-0000'));
  assert.deepEqual(ids, ['aaaaaaaa-0000', 'bbbbbbbb-1111']);
});

test('a creator page maps name, booth, date, genres and one SNS link', () => {
  const event = parseCreatorPage(creatorPage(), 'eab0a306', source);
  assert.equal(event.title, 'ボタニカルライフ');
  assert.equal(event.startDate, '2026-09-06');
  assert.equal(event.place, '東京ドームシティ プリズムホール · ブースA-05');
  assert.equal(event.category, 'アクセサリー');
  assert.equal(event.description, 'https://instagram.com/ayaka_botanicallife/');
  assert.equal(event.sourceUrl, 'https://tokyo.handmade-marche.jp/creators/?exhibitor_id=eab0a306');
});

test('multiple genre tags are kept, not just the first', () => {
  const event = parseCreatorPage(creatorPage({ genres: ['クッキー', '各種焼き菓子', '和菓子'] }), 'x', source);
  assert.equal(event.category, 'クッキー・各種焼き菓子・和菓子');
});

test('a creator with no SNS link is still a valid candidate', () => {
  const event = parseCreatorPage(creatorPage({ sns: null }), 'x', source);
  assert.ok(!('description' in event));
});

test('a page missing the creator name or the attendance date is dropped', () => {
  assert.equal(parseCreatorPage(creatorPage({ name: '' }), 'x', source), null);
  assert.equal(parseCreatorPage(creatorPage({ date: '' }), 'x', source), null);
});

test('discovery fetches every registered genre once and unions the ids', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => listPage('aaaa0000-face', String(url).includes('genre=1') ? 'bbbb1111-face' : 'cccc2222-face') };
  };
  const ids = await discoverExhibitorIds(fetchImpl);
  assert.equal(requested.length, HANDMADE_MARCHE_GENRES.length);
  assert.ok(ids.includes('aaaa0000-face'));
  assert.ok(ids.includes('bbbb1111-face'));
});

test('a failed genre page is skipped rather than aborting discovery', async () => {
  const fetchImpl = async (url) => String(url).includes('genre=2')
    ? { ok: false, status: 500, text: async () => '' }
    : { ok: true, status: 200, text: async () => listPage('aaaaaaaa-1111') };
  const ids = await discoverExhibitorIds(fetchImpl);
  assert.deepEqual(ids, ['aaaaaaaa-1111']);
});

test('fetchCreator wraps a failed request as null rather than throwing', async () => {
  const event = await fetchCreator('x', source, async () => ({ ok: false, status: 404, text: async () => '' }));
  assert.equal(event, null);
});
