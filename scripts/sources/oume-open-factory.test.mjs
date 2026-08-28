import test from 'node:test';
import assert from 'node:assert/strict';
import { OUME_URL, normaliseAddress, parseOumeFactories } from './oume-open-factory.mjs';

const source = { name: 'おうめオープンファクトリー2025', startDate: '2026-08-29' };

const card = ({
  number = '01',
  name = '小澤酒造株式会社',
  hook = '来て・見て・学んで・ちょっと呑める。酒造りの現場。',
  address = '青梅市沢井2-770',
  phone = '0428-78-8215',
  site = 'https://www.sawanoi-sake.com/',
  business = '元禄15年(西暦1702年)創業。日本酒「澤乃井」を醸す造り酒屋です。',
} = {}) => `
<div id="factory${number}" class="factory color01"><div class="inner"><div class="acdn"><div class="acdn_content"><div class="outline">
  <figure><img src="x.jpg" alt="${name}"></figure>
  <div class="col">
    <h3><b>${number}</b>${name}</h3>
    <h4><mark class="marker">${hook}</mark></h4>
    <p>${address}<br />
${phone}<br />
${site ? `<a href="${site}" target="_blank">${site}</a>` : ''}</p>
    ${business ? `<dl><dt>事業内容 BUSINESS</dt><dd>${business}</dd></dl>` : ''}
  </div>
</div></div></div></div></div>`;

const page = (...cards) => `<html><body><section id="factory" class="factories">${cards.join('')}</section></body></html>`;

test('a factory card becomes a place candidate with its address', () => {
  const [event] = parseOumeFactories(page(card()), source);
  assert.equal(event.title, '小澤酒造株式会社');
  assert.equal(event.place, '東京都青梅市沢井2-770');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true);
  assert.equal(event.endDate, undefined);
  assert.equal(event.category, '町工場・工房');
  assert.equal(event.sourceUrl, 'https://www.sawanoi-sake.com/');
  assert.match(event.description, /酒造りの現場/);
  assert.match(event.description, /元禄15年/);
});

test('the leading number is stripped from the name', () => {
  // The <h3> is `<b>01</b>小澤酒造株式会社`; left in, the title reads 「01小澤酒造…」.
  const [event] = parseOumeFactories(page(card()), source);
  assert.ok(!event.title.startsWith('01'), event.title);
});

test('the phone number never lands in the address', () => {
  // Address, phone and site share one <p> separated by <br>. Read as a single
  // string, the address would come out as 「青梅市沢井2-770 0428-78-8215 …」.
  const [event] = parseOumeFactories(page(card()), source);
  assert.equal(event.place, '東京都青梅市沢井2-770');
  const blob = JSON.stringify(event);
  assert.ok(!/0428-78-8215/.test(blob), blob);
});

test('a parenthetical qualifier on the address is kept', () => {
  // 「青梅市梅郷6-1438-1(作業場)」 tells the visitor which building to go to.
  const [event] = parseOumeFactories(page(card({ address: '青梅市梅郷6-1438-1(作業場)' })), source);
  assert.equal(event.place, '東京都青梅市梅郷6-1438-1(作業場)');
});

test('the prefecture is restored, because this site omits it', () => {
  assert.equal(normaliseAddress('青梅市沢井2-770'), '東京都青梅市沢井2-770');
  assert.equal(normaliseAddress('東京都青梅市沢井2-770'), '東京都青梅市沢井2-770');
  assert.equal(normaliseAddress('埼玉県飯能市1-2'), '埼玉県飯能市1-2');
  assert.equal(normaliseAddress(''), null);
  assert.equal(normaliseAddress('調整中'), null);
});

test('a factory with no site of its own falls back to its anchor on the roster', () => {
  const [event] = parseOumeFactories(page(card({ site: '' })), source);
  assert.equal(event.sourceUrl, `${OUME_URL}#factory01`);
});

test('every factory on the page gets a distinct id', () => {
  const events = parseOumeFactories(page(card(), card({ number: '02', name: '株式会社MOPTOP', site: 'https://moptop.jp' })), source);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
});

test('a card with no address is not a destination', () => {
  assert.deepEqual(parseOumeFactories(page(card({ address: '' })), source), []);
});

test('a page with no roster section yields nothing rather than throwing', () => {
  assert.deepEqual(parseOumeFactories('<html><body><p>準備中</p></body></html>', source), []);
});
