import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDMADE_MARCHE_SITES, discoverExhibitorIds, fetchCreator, parseAttendanceDate, parseCreatorPage, parseExhibitorIds, parseTotalCount } from './handmade-marche.mjs';

const source = { name: '東京ハンドメイドマルシェ2026秋', year: 2026, venue: '東京ドームシティ プリズムホール', origin: 'https://tokyo.handmade-marche.jp' };

const listPage = (ids, total = 722) => `<html><body><ul>${ids.map((id) => `
  <li><a href="/creators/?exhibitor_id=${id}"><img src="/user_files/x/400"></a></li>`).join('')}</ul>
  <div id="listPager"><p class="pageData">全 ${total} 件中<br>1 - 20 件を表示</p></div>
</body></html>`;

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

test('exhibitor ids are extracted from a list page, deduped', () => {
  const ids = parseExhibitorIds(listPage(['aaaa0000-face', 'bbbb1111-face', 'aaaa0000-face']));
  assert.deepEqual(ids, ['aaaa0000-face', 'bbbb1111-face']);
});

test("the list page's own total is read, so a walk can be checked against it", () => {
  assert.equal(parseTotalCount(listPage(['aaaa0001-face'], 722)), 722);
  assert.equal(parseTotalCount(listPage(['aaaa0001-face'], '1,234'.replace(',', ''))), 1234);
  assert.equal(parseTotalCount('<html><body>no count here</body></html>'), null);
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

test('the source URL follows the city site, not a hardcoded Tokyo origin', () => {
  // One operator, one site per city, same markup — the parser must not pin Tokyo.
  const yokohama = { ...source, origin: 'https://handmade-marche.jp', venue: 'パシフィコ横浜' };
  const event = parseCreatorPage(creatorPage(), 'abc123', yokohama);
  assert.equal(event.sourceUrl, 'https://handmade-marche.jp/creators/?exhibitor_id=abc123');
  assert.equal(event.place, 'パシフィコ横浜 · ブースA-05');
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

test('discovery walks pages until one comes back empty', async () => {
  const pages = { 1: ['aaaa0001-face', 'aaaa0002-face'], 2: ['bbbb0001-face'], 3: [] };
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    const page = Number(String(url).match(/page=(\d+)/)[1]);
    return { ok: true, status: 200, text: async () => listPage(pages[page] ?? []) };
  };
  const { ids, total } = await discoverExhibitorIds(fetchImpl);
  assert.deepEqual(ids, ['aaaa0001-face', 'aaaa0002-face', 'bbbb0001-face']);
  assert.equal(total, 722);
  assert.equal(requested.length, 3, 'stops at the first empty page rather than running to maxPages');
});

test('discovery never sends a genre filter', async () => {
  // Regression: `?genre=N` alone is silently ignored by the site and returns the
  // same unfiltered first rows for every genre — walking genres collected 49 of
  // 722 exhibitors while looking like it worked. See the module doc comment.
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => listPage(requested.length === 1 ? ['cccc0001-face'] : []) };
  };
  await discoverExhibitorIds(fetchImpl);
  assert.ok(requested.every((url) => !url.includes('genre=')), 'genre must never appear in a discovery URL');
  assert.ok(requested.every((url) => url.includes('s=')), 'the search marker `s` is what makes the listing paginate');
});

test('discovery follows the requested city origin', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => listPage([]) };
  };
  await discoverExhibitorIds(fetchImpl, { origin: 'https://handmade-marche.jp' });
  assert.ok(requested[0].startsWith('https://handmade-marche.jp/creators/list_creators/'));
});

test('a failed list page ends the walk rather than aborting the run', async () => {
  const fetchImpl = async (url) => (String(url).includes('page=2')
    ? { ok: false, status: 500, text: async () => '' }
    : { ok: true, status: 200, text: async () => listPage(['aaaa1111-dead']) });
  const { ids } = await discoverExhibitorIds(fetchImpl);
  assert.deepEqual(ids, ['aaaa1111-dead']);
});

test('fetchCreator wraps a failed request as null rather than throwing', async () => {
  const event = await fetchCreator('x', source, async () => ({ ok: false, status: 404, text: async () => '' }));
  assert.equal(event, null);
});

test('every registered city site has a distinct origin', () => {
  const origins = HANDMADE_MARCHE_SITES.map((site) => site.origin);
  assert.equal(new Set(origins).size, origins.length);
  assert.ok(HANDMADE_MARCHE_SITES.every((site) => site.origin.startsWith('https://')));
});
