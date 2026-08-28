import test from 'node:test';
import assert from 'node:assert/strict';
import { mapShop, mapShops, monomachiDataUrl, withoutContacts } from './monomachi.mjs';

const source = { name: 'モノマチ2026', year: 2026, startDate: '2026-08-28' };

const shop = (overrides = {}) => ({
  id: 'a1',
  name: 'RAGTIME UMBRELLA FACTORY',
  category: '傘屋',
  address: '東京都台東区寿1-16-1 寿セントラルマンション1F',
  phone: '362317723',
  url: 'https://www.rag-t.com/',
  text: '一本ずつ手で組み立てる傘の工房です。',
  ...overrides,
});

test('a shop becomes a place candidate carrying its address', () => {
  const event = mapShop(shop(), source);
  assert.equal(event.title, 'RAGTIME UMBRELLA FACTORY');
  assert.equal(event.place, '東京都台東区寿1-16-1 寿セントラルマンション1F');
  assert.equal(event.category, '傘屋');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true, 'a workshop has no closing day');
  assert.equal(event.endDate, undefined);
  assert.equal(event.sourceUrl, 'https://www.rag-t.com/');
});

test('a shop with no site of its own falls back to its directory entry, keeping ids distinct', () => {
  const a = mapShop(shop({ url: '', id: 'a1' }), source);
  const b = mapShop(shop({ url: '', id: 'b2', name: 'ヤマト屋' }), source);
  assert.match(a.sourceUrl, /2026\.monomachi\.com\/shop\.html#/);
  assert.notEqual(a.id, b.id);
});

test('a row without an address is not a destination', () => {
  assert.equal(mapShop(shop({ address: '' }), source), null);
});

test('an address outside the collected prefecture is dropped', () => {
  assert.equal(mapShop(shop({ address: '神奈川県横浜市中区1-1' }), source), null);
  assert.ok(mapShop(shop({ address: '神奈川県横浜市中区1-1' }), { ...source, prefecture: '神奈川県' }));
});

test('phone numbers and e-mail addresses never reach a candidate', () => {
  // The payload carries a `phone` column and 92 workshop e-mail addresses in
  // its free text. An address is what makes a workshop findable; compiling
  // small businesses' direct contact details is not this project's business.
  const event = mapShop(shop({ text: 'お問い合わせは info@atelier-ki.com、TEL:03-1234-5678 まで。革小物の工房です。' }), source);
  const blob = `${event.description} ${event.place} ${event.why} ${event.title} ${JSON.stringify(event)}`;
  assert.ok(!/@[\w.-]+\.[a-z]{2,}/.test(blob), blob);
  assert.ok(!/362317723|03-1234-5678/.test(blob), blob);
  assert.match(event.description, /革小物の工房/);
});

test('withoutContacts leaves ordinary prose alone', () => {
  assert.equal(withoutContacts('  一本ずつ手で   組み立てる傘の工房です。 '), '一本ずつ手で 組み立てる傘の工房です。');
  assert.equal(withoutContacts(''), '');
});

test('only the shop directory is mapped; the weekend programme is not', () => {
  // `all_events` is genuinely date-bound — it expired with the fair. Turning it
  // into places would claim a workshop runs every day, which is false.
  const events = mapShops({ shops: [shop(), shop({ id: 'b', name: 'ヤマト屋' })], all_events: [{ title: 'ワークショップ' }] }, source);
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.changeType === 'discovery'));
});

test('an empty or missing payload yields nothing rather than throwing', () => {
  assert.deepEqual(mapShops({}, source), []);
  assert.deepEqual(mapShops(null, source), []);
});

test('the data URL follows the edition year', () => {
  assert.equal(monomachiDataUrl(2026), 'https://2026.monomachi.com/monomachi_data_2026.json');
  assert.equal(monomachiDataUrl('2027'), 'https://2027.monomachi.com/monomachi_data_2027.json');
});
