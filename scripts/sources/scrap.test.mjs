import test from 'node:test';
import assert from 'node:assert/strict';
import { SCRAP_SOURCES, parsePeriod, parseScrap } from './scrap.mjs';

const shopSource = { name: 'リアル脱出ゲーム池袋店', family: 'shop', origin: 'https://www.scrapmagazine.com' };
const tmcSource = { name: '東京ミステリーサーカス', family: 'tmc', origin: 'https://mysterycircus.jp' };

const shopItem = ({ href = 'https://realdgame.jp/shop/ikebukuro/events/hyoryu/', title = '【池袋店】リアル脱出ゲーム『漂流した救命ボートからの脱出』', period = '開催：2026年1月29日(木)〜', price = '前売：3,500円〜' } = {}) => `
<li><a href="${href}">
  <p class="tit">${title}</p>
  <ul class="details">
    <li><p class="icon_watch">40分</p></li>
    <li><p class="icon_people">4人</p></li>
    <li><p class="icon_time">100分</p></li>
    <li><p class="icon_price">${price}</p></li>
    <li><p class="icon_period">${period}</p></li>
  </ul>
</a></li>`;

const shopPage = (...items) => `<html><body><ul class="list02">${items.join('\n')}</ul></body></html>`;

const tmcItem = ({ href = 'https://mysterycircus.jp/tokyo/events/13929', title = 'リアル脱出ゲーム『カジノロワイヤルからの脱出』(リバイバル)', period = '開催：2026.07.01〜2026.10.12', price = '1人 4,200円~' } = {}) => `
<article class="js_eventsItem">
  <a href="${href}" title="${title}" class="events-item-inner">
    <div class="events-item-contents"><h4 class="event-item-title"><span>${title}</span></h4></div>
    <ul class="event-item-system">
      <li class="event-item-system-icon limit">60分</li>
      <li class="event-item-system-icon person">6人</li>
      <li class="event-item-system-icon duration">100分</li>
      <li class="event-item-system-icon price">${price}</li>
      <li class="event-item-system-icon period">${period}</li>
    </ul>
  </a>
</article>`;

const tmcPage = (...items) => `<html><body>${items.join('\n')}</body></html>`;

test('every real period format across both templates parses', () => {
  assert.deepEqual(parsePeriod('開催：2026年1月29日(木)〜'), { startDate: '2026-01-29', endDate: null, ongoing: true });
  assert.deepEqual(parsePeriod('開催：2026年9月3日(木)〜12月6日(日)'), { startDate: '2026-09-03', endDate: '2026-12-06', ongoing: false });
  assert.deepEqual(parsePeriod('開催：2026.07.01〜2026.10.12'), { startDate: '2026-07-01', endDate: '2026-10-12', ongoing: false });
  // The fullwidth tilde （U+FF5E） appears on this same site alongside the wave dash.
  assert.deepEqual(parsePeriod('開催：2026.7.9～2026.9.6'), { startDate: '2026-07-09', endDate: '2026-09-06', ongoing: false });
});

test('a trailing 〜 means "until further notice", no 〜 at all means one day', () => {
  // These used to be indistinguishable — both came back as "no end date", which
  // the pool read as single-day, so 24 still-bookable games had aged out of the
  // back office by 2026-08-28. The wording is the source's own, not a guess.
  assert.deepEqual(parsePeriod('開催：2024年12月29日(日)〜'), { startDate: '2024-12-29', endDate: null, ongoing: true });
  assert.deepEqual(parsePeriod('開催：2026年8月30日(土)'), { startDate: '2026-08-30', endDate: null, ongoing: false });
  // A 〜 followed by prose rather than a date is still open-ended.
  assert.deepEqual(parsePeriod('開催：2026年3月1日(日)〜好評につき延長中'), { startDate: '2026-03-01', endDate: null, ongoing: true });
});

test('a same-day range reports one day, not an open-ended run', () => {
  assert.deepEqual(parsePeriod('開催：2026年5月4日(月)〜2026年5月4日(月)'), { startDate: '2026-05-04', endDate: null, ongoing: false });
});

test('an end date with no year rolls into the next year across December', () => {
  assert.deepEqual(parsePeriod('開催：2026年12月20日(日)〜1月5日(月)'), { startDate: '2026-12-20', endDate: '2027-01-05', ongoing: false });
});

test('an unparseable period yields nothing rather than a guess', () => {
  assert.deepEqual(parsePeriod('日程未定'), { startDate: null, endDate: null, ongoing: false });
  assert.deepEqual(parsePeriod(''), { startDate: null, endDate: null, ongoing: false });
});

test('the shop template (池袋/吉祥寺) parses title, dates, price and duration', () => {
  const [event] = parseScrap(shopPage(shopItem()), shopSource);
  assert.equal(event.title, '【池袋店】リアル脱出ゲーム『漂流した救命ボートからの脱出』');
  assert.equal(event.startDate, '2026-01-29');
  assert.ok(!('endDate' in event));
  assert.equal(event.sourceUrl, 'https://realdgame.jp/shop/ikebukuro/events/hyoryu/');
  assert.equal(event.price, '前売：3,500円〜');
  assert.match(event.time, /40分/);
  assert.match(event.time, /4人/);
  assert.equal(event.place, 'リアル脱出ゲーム池袋店');
  assert.equal(event.category, '脱出ゲーム・謎解き');
});

test('the TMC template (東京ミステリーサーカス) parses the same fields from different markup', () => {
  const [event] = parseScrap(tmcPage(tmcItem()), tmcSource);
  assert.equal(event.title, 'リアル脱出ゲーム『カジノロワイヤルからの脱出』(リバイバル)');
  assert.equal(event.startDate, '2026-07-01');
  assert.equal(event.endDate, '2026-10-12');
  assert.equal(event.sourceUrl, 'https://mysterycircus.jp/tokyo/events/13929');
  assert.equal(event.price, '1人 4,200円~');
});

test('a link that resolves to a different domain (realdgame.jp) is kept as-is', () => {
  // Detail pages live on the platform domain even though the listing itself
  // is served from a clean one; linking out is not the same as crawling it.
  const [event] = parseScrap(shopPage(shopItem({ href: 'https://realdgame.jp/s/blueroom/' })), shopSource);
  assert.equal(event.sourceUrl, 'https://realdgame.jp/s/blueroom/');
});

test('a listing with no parseable period is dropped rather than guessed', () => {
  assert.deepEqual(parseScrap(shopPage(shopItem({ period: '日程未定' })), shopSource), []);
});

test('all three confirmed venues are registered, none on the flagged realdgame.jp domain', () => {
  assert.equal(SCRAP_SOURCES.length, 3);
  for (const source of SCRAP_SOURCES) {
    assert.ok(['shop', 'tmc'].includes(source.family), source.name);
    assert.ok(!source.origin.includes('realdgame.jp'), source.name);
  }
});
