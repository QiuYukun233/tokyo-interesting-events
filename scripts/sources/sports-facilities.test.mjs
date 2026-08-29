import test from 'node:test';
import assert from 'node:assert/strict';
import { NICHE_SPORTS, isAvailable, mapFacilities, mapFacility, selectDatasets } from './sports-facilities.mjs';

const source = { name: '中野区 スポーツ施設', org: '中野区', datasetUrl: 'https://example.test/nakano.csv', startDate: '2026-08-30' };

const row = (overrides = {}) => ({
  名称: '哲学堂運動施設（野球場、庭球場、弓道場）',
  所在地_連結表記: '中野区松が丘1-34-28',
  利用可能曜日: '月火水木金土日',
  開始時間: '09:00',
  URL: 'https://www.tetsugakudo.jp/tetsugakudou/niwa.html',
  弓道: '有',
  水泳: '無',
  卓球: '有',
  アーチェリー: '無',
  ...overrides,
});

test('有/無 is what marks a discipline available, not presence of the column', () => {
  // The first attempt read "column is non-empty" as "sport is offered", which
  // marked every facility as offering everything: twelve disciplines each
  // hitting exactly 169 times. The suspiciously round number exposed it.
  assert.equal(isAvailable('有'), true);
  assert.equal(isAvailable('無'), false);
  assert.equal(isAvailable(''), false);
  assert.equal(isAvailable('○'), true);
  assert.equal(isAvailable('あり'), true);
});

test('a facility with a niche discipline becomes a place candidate', () => {
  const event = mapFacility(row(), source);
  assert.equal(event.title, '哲学堂運動施設（野球場、庭球場、弓道場）');
  assert.equal(event.place, '東京都中野区松が丘1-34-28');
  assert.equal(event.category, '弓道');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true, 'a public facility has no end date');
  assert.equal(event.endDate, undefined);
  assert.match(event.description, /弓道ができる公共施設/);
  assert.equal(event.sourceUrl, 'https://www.tetsugakudo.jp/tetsugakudou/niwa.html');
  assert.match(event.attribution, /CC BY/);
});

test('a gym offering only ordinary sports is not a destination', () => {
  // Nobody crosses Tokyo for the nearest table tennis table; the point of the
  // filter is that 「弓道場がある」 is a reason to go somewhere specific.
  assert.equal(mapFacility(row({ 弓道: '無' }), source), null);
});

test('every listed discipline goes into the description, the first into category', () => {
  const event = mapFacility(row({ アーチェリー: '有', なぎなた: '有' }), source);
  assert.equal(event.category, '弓道', 'the list order decides, so it is stable');
  assert.match(event.description, /弓道・アーチェリー・なぎなた/);
});

test('the prefecture is added when the ward writes only its own name', () => {
  assert.equal(mapFacility(row(), source).place, '東京都中野区松が丘1-34-28');
  assert.equal(mapFacility(row({ 所在地_連結表記: '東京都中野区松が丘1-34-28' }), source).place, '東京都中野区松が丘1-34-28');
});

test('a row with no address is dropped even if it offers archery', () => {
  assert.equal(mapFacility(row({ 所在地_連結表記: '', 所在地_市区町村: '', 所在地_町字: '' }), source), null);
});

test('a facility with no page of its own cites the dataset, keeping ids distinct', () => {
  const a = mapFacility(row({ URL: '', 名称: '弓道場' }), source);
  const b = mapFacility(row({ URL: '', 名称: '第二弓道場' }), source);
  assert.match(a.sourceUrl, /nakano\.csv#/);
  assert.notEqual(a.id, b.id);
});

test('only datasets that list sports facilities and publish a CSV are selected', () => {
  const payload = { result: { results: [
    { title: 'スポーツ施設一覧', organization: { title: '中野区' }, license_title: 'CC BY', resources: [{ format: 'CSV', url: 'a.csv' }] },
    { title: 'スポーツ施設', organization: { title: '港区' }, resources: [{ format: 'XLSX', url: 'b.xlsx' }] },
    { title: '公園一覧', organization: { title: '港区' }, resources: [{ format: 'CSV', url: 'c.csv' }] },
  ] } };
  const datasets = selectDatasets(payload);
  assert.equal(datasets.length, 1, 'XLSX-only and non-facility datasets are skipped');
  assert.equal(datasets[0].org, '中野区');
  assert.equal(datasets[0].url, 'a.csv');
});

test('an empty or malformed catalogue response yields nothing rather than throwing', () => {
  assert.deepEqual(selectDatasets({}), []);
  assert.deepEqual(selectDatasets({ result: { results: [] } }), []);
});

test('mapFacilities keeps only the qualifying rows', () => {
  const events = mapFacilities([row(), row({ 名称: 'プールだけ', 弓道: '無' })], source);
  assert.equal(events.length, 1);
});

test('the niche list excludes the ordinary furniture of a municipal gym', () => {
  // If 水泳/卓球/テニス were in here almost every facility would qualify and the
  // filter would mean nothing.
  for (const ordinary of ['水泳', '卓球', 'テニス', '軟式野球', 'バスケットボール']) {
    assert.ok(!NICHE_SPORTS.includes(ordinary), `${ordinary} must not count as niche`);
  }
  assert.ok(NICHE_SPORTS.includes('弓道'));
  assert.ok(NICHE_SPORTS.includes('なぎなた'));
});
