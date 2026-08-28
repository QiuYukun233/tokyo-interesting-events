import test from 'node:test';
import assert from 'node:assert/strict';
import { FACILITIES_URL, parseAddress, parseFacilities } from './dento-tokyo.mjs';

const source = { name: '東京の伝統工芸品', startDate: '2026-08-29' };

const facility = ({
  name = '台東区立江戸下町伝統工芸館',
  address = '〒111-0032　東京都台東区浅草2-22-13',
  phone = '03-3842-1990',
  access = '【電車】つくばエクスプレス「浅草」駅下車徒歩5分<br />【駐車場】なし',
} = {}) => `
<h2>${name}</h2>
<div class="items_table"><table summary="${name}"><tbody>
  <tr><th>所在地</th><td>${address}</td></tr>
  <tr><th>電話番号</th><td>${phone}</td></tr>
  <tr><th>アクセス</th><td>${access}</td></tr>
</tbody></table></div>`;

const page = (...items) => `<html><body><div id="main_container">${items.join('')}</div></body></html>`;

test('a facility becomes a place candidate with its address and access notes', () => {
  const [event] = parseFacilities(page(facility()), source);
  assert.equal(event.title, '台東区立江戸下町伝統工芸館');
  assert.equal(event.place, '東京都台東区浅草2-22-13');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true, 'a standing facility has no end date');
  assert.equal(event.endDate, undefined);
  assert.equal(event.category, '伝統工芸にふれる公共施設');
  assert.match(event.description, /つくばエクスプレス/);
  assert.equal(event.sourceUrl, `${FACILITIES_URL}#${encodeURIComponent('台東区立江戸下町伝統工芸館')}`);
});

test('the postal code is stripped, the ideographic space included', () => {
  assert.equal(parseAddress('〒111-0032　東京都台東区浅草2-22-13'), '東京都台東区浅草2-22-13');
  assert.equal(parseAddress('〒124-0012 東京都葛飾区立石7-3-16'), '東京都葛飾区立石7-3-16');
  assert.equal(parseAddress('準備中'), null);
  assert.equal(parseAddress(''), null);
});

test('the phone number never reaches the candidate', () => {
  const [event] = parseFacilities(page(facility()), source);
  assert.ok(!/3842-1990/.test(JSON.stringify(event)));
});

test('a commented-out facility is not collected', () => {
  // 葛飾区伝統産業館's block is wrapped in `<!--h2>…</div-->` on the live page:
  // the bureau took it down without deleting it. A commented-out entry is not
  // published, so nine of the ten `summary=` attributes are the right answer.
  const html = page(facility(), `<!--${facility({ name: '葛飾区伝統産業館', address: '〒124-0012 東京都葛飾区立石7-3-16' })}-->`);
  const events = parseFacilities(html, source);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, '台東区立江戸下町伝統工芸館');
});

test('each facility gets a distinct id', () => {
  const events = parseFacilities(page(facility(), facility({ name: 'すみだ郷土文化資料館', address: '〒131-0033　東京都墨田区向島2-3-5' })), source);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
});

test('a table with no usable address is skipped', () => {
  assert.deepEqual(parseFacilities(page(facility({ address: '調整中' })), source), []);
});

test('a page with no facility tables yields nothing rather than throwing', () => {
  assert.deepEqual(parseFacilities('<html><body><p>準備中</p></body></html>', source), []);
});
