import test from 'node:test';
import assert from 'node:assert/strict';
import { SANBO_HALLS, parseEventDates, parseSanbo, sanboUrls } from './sanbo.mjs';

const source = { name: '東京都立産業貿易センター 台東館', venue: '东京都立产业贸易中心 台东馆（浅草）', url: 'https://www.sanbo.metro.tokyo.lg.jp/taito/event?year=2026&month=8' };

const row = ({ title = 'ローデンツ', status = '公開', category = '即売会', organiser = 'Ｌｉｒ', area = '６階南側', date = '2026/08/01', detailId = '40455' } = {}) => `
<div class="event">
  <a href="${detailId ? `/taito/event/${detailId}` : 'javascript:void(0)'}" class="aceptLink">
    ${status ? `<p class="event-status status01"><span>${status}</span></p>` : ''}
    <div class="img"><p class="category"><span class="taito">台東館</span><span class="cat03">${category}</span></p></div>
    <div class="body">
      <p class="title">${title}</p>
      <p class="txt"><span class="inrTit">主催者</span>：<br class="spOnly">${organiser}</p>
      <p class="tel"><span class="inrTit">問合せ</span>：<br class="spOnly"></p>
      <p class="area"><span class="inrTit">会場</span>：<br class="spOnly">${area}</p>
      <p class="date">${date}</p>
    </div>
  </a>
</div>`;

const page = (...rows) => `<html><body><div class="eventList">${rows.join('')}</div></body></html>`;

test('a booking row maps title, dates, floor, organiser and detail link', () => {
  const [event] = parseSanbo(page(row()), source);
  assert.equal(event.title, 'ローデンツ');
  assert.equal(event.startDate, '2026-08-01');
  assert.ok(!('endDate' in event));
  assert.equal(event.place, '东京都立产业贸易中心 台东馆（浅草） · ６階南側');
  assert.equal(event.category, '即売会');
  assert.equal(event.audience, '公開');
  assert.equal(event.attribution, 'Ｌｉｒ');
  assert.equal(event.sourceUrl, 'https://www.sanbo.metro.tokyo.lg.jp/taito/event/40455');
});

test('a multi-day booking keeps both ends', () => {
  const [event] = parseSanbo(page(row({ date: '2026/08/01 〜 2026/08/03' })), source);
  assert.equal(event.startDate, '2026-08-01');
  assert.equal(event.endDate, '2026-08-03');
});

test('a range whose two dates are the same reports no end date', () => {
  const [event] = parseSanbo(page(row({ date: '2026/08/01 〜 2026/08/01' })), source);
  assert.equal(event.endDate, undefined);
});

test('the 公開区分 badge is carried onto audience so the gate can rule on it', () => {
  // 招待 / 関係者のみ is the venue's own record that the public cannot walk in —
  // lib/gate.mjs turns it into rule:not_open_to_public.
  for (const status of ['公開', '招待', '関係者のみ']) {
    const [event] = parseSanbo(page(row({ status })), source);
    assert.equal(event.audience, status);
  }
});

test('a row with no badge leaves audience unset rather than assuming public', () => {
  const [event] = parseSanbo(page(row({ status: '' })), source);
  assert.ok(!('audience' in event));
});

test('a placeholder anchor is not mistaken for a detail page', () => {
  // Non-public rows still render an <a>, but its href is `javascript:void(0)`;
  // treating that as a link produced candidates pointing at literal
  // "javascript:void(0)" URLs.
  const [event] = parseSanbo(page(row({ detailId: null })), source);
  assert.equal(event.sourceUrl, source.url);
});

test('label text is stripped from the organiser and floor values', () => {
  const [event] = parseSanbo(page(row({ organiser: '日本ペン習字研究会', area: '７階' })), source);
  assert.equal(event.attribution, '日本ペン習字研究会');
  assert.ok(event.place.endsWith('７階'));
});

test('rows without a title or a parseable date are skipped', () => {
  assert.equal(parseSanbo(page(row({ title: '' })), source).length, 0);
  assert.equal(parseSanbo(page(row({ date: '未定' })), source).length, 0);
});

test('an empty month parses to zero events rather than throwing', () => {
  // Past months and months past the calendar's ~10-month horizon return 200
  // with no rows; that is normal here, not a broken parser.
  assert.deepEqual(parseSanbo('<html><body><div class="eventList"></div></body></html>', source), []);
});

test('parseEventDates handles a single date, a range, and neither', () => {
  assert.deepEqual(parseEventDates('2026/11/15'), { startDate: '2026-11-15', endDate: null });
  assert.deepEqual(parseEventDates('2026/11/04 〜 2026/11/06'), { startDate: '2026-11-04', endDate: '2026-11-06' });
  assert.deepEqual(parseEventDates('調整中'), { startDate: null, endDate: null });
});

test('the URL window starts at the current month and walks forward', () => {
  const urls = sanboUrls('taito', new Date('2026-08-28T00:00:00Z'), 3);
  assert.deepEqual(urls, [
    'https://www.sanbo.metro.tokyo.lg.jp/taito/event?year=2026&month=8',
    'https://www.sanbo.metro.tokyo.lg.jp/taito/event?year=2026&month=9',
    'https://www.sanbo.metro.tokyo.lg.jp/taito/event?year=2026&month=10',
  ]);
});

test('the window rolls over a year boundary', () => {
  const urls = sanboUrls('hamamatsucho', new Date('2026-11-15T00:00:00Z'), 3);
  assert.equal(urls[1], 'https://www.sanbo.metro.tokyo.lg.jp/hamamatsucho/event?year=2026&month=12');
  assert.equal(urls[2], 'https://www.sanbo.metro.tokyo.lg.jp/hamamatsucho/event?year=2027&month=1');
});

test('both halls are registered with distinct keys', () => {
  assert.deepEqual(SANBO_HALLS.map((hall) => hall.key), ['taito', 'hamamatsucho']);
});
