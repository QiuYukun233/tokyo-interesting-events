import test from 'node:test';
import assert from 'node:assert/strict';
import { LEISURE_FACILITIES, SCHOOL_FACILITY, isAvailable, mapFacilities, mapFacility, selectDatasets } from './sports-facilities.mjs';

const source = { name: '江戸川区 スポーツ施設', org: '江戸川区', datasetUrl: 'https://example.test/edogawa.csv', startDate: '2026-08-30' };

const row = (overrides = {}) => ({
  名称: '新左近川親水公園カヌー場',
  所在地_連結表記: '江戸川区臨海町2-2',
  利用可能曜日: '月火水木金土日',
  開始時間: '09:00',
  URL: 'https://example.test/canoe',
  カヌー: '有',
  水泳: '無',
  弓道: '無',
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
});

test('a walk-in leisure facility becomes a place candidate', () => {
  const event = mapFacility(row(), source);
  assert.equal(event.title, '新左近川親水公園カヌー場');
  assert.equal(event.place, '東京都江戸川区臨海町2-2');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true, 'a public facility has no end date');
  assert.equal(event.category, 'カヌー');
});

test('a rare sport inside an ordinary gym is NOT a destination', () => {
  // The lesson from review: 9 of 11 judged were rejected, including a building
  // named 「弓道場」. To shoot there you must join, book and bring equipment —
  // the room exists, the outing does not.
  assert.equal(mapFacility(row({ 名称: '大田区総合体育館', カヌー: '無', 弓道: '有' }), source), null);
  assert.equal(mapFacility(row({ 名称: '弓道場', カヌー: '無', 弓道: '有' }), source), null);
  assert.equal(mapFacility(row({ 名称: '杉並区妙正寺体育館', カヌー: '無', なぎなた: '有' }), source), null);
});

test('the name is what decides, because that is where walk-in leisure is stated', () => {
  // 「プール」 names an ordinary sport and is a destination; 「弓道場」 names a
  // rare one and is not. So the filter reads the name, not the sport columns.
  assert.ok(LEISURE_FACILITIES.test('千歳温水プール'));
  assert.ok(LEISURE_FACILITIES.test('夢の島スケートボードパーク'));
  assert.ok(LEISURE_FACILITIES.test('新左近川親水公園カヌー場'));
  assert.ok(!LEISURE_FACILITIES.test('総合体育館'));
  assert.ok(!LEISURE_FACILITIES.test('北野公園野球場'));
});

test('school facilities are excluded even when they hold a pool', () => {
  // 「品川学園温水プール」 opens to residents on limited terms, not to a visitor
  // deciding where to go on Saturday.
  assert.ok(SCHOOL_FACILITY.test('五本木小学校屋内プール'));
  assert.ok(SCHOOL_FACILITY.test('品川学園温水プール'));
  assert.equal(mapFacility(row({ 名称: '五本木小学校屋内プール', 水泳: '有' }), source), null);
  assert.equal(mapFacility(row({ 名称: '品川学園温水プール', 水泳: '有' }), source), null);
  assert.ok(mapFacility(row({ 名称: '杉並区高井戸温水プール', 水泳: '有' }), source), 'a public pool still passes');
});

test('a leisure facility with no sport column set still describes itself', () => {
  const event = mapFacility(row({ カヌー: '無', 名称: '戸吹スポーツ公園スケートパーク' }), source);
  assert.ok(event);
  assert.equal(event.category, '水遊び・レジャー');
  assert.match(event.description, /レジャー施設/);
});

test('the prefecture is added when the ward writes only its own name', () => {
  assert.equal(mapFacility(row(), source).place, '東京都江戸川区臨海町2-2');
  assert.equal(mapFacility(row({ 所在地_連結表記: '東京都江戸川区臨海町2-2' }), source).place, '東京都江戸川区臨海町2-2');
});

test('a row with no address is dropped even if it is a pool', () => {
  assert.equal(mapFacility(row({ 所在地_連結表記: '', 所在地_市区町村: '', 所在地_町字: '', 名称: '市民プール' }), source), null);
});

test('a facility with no page of its own cites the dataset, keeping ids distinct', () => {
  const a = mapFacility(row({ URL: '', 名称: '第一市民プール' }), source);
  const b = mapFacility(row({ URL: '', 名称: '第二市民プール' }), source);
  assert.match(a.sourceUrl, /edogawa\.csv#/);
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
});

test('an empty or malformed catalogue response yields nothing rather than throwing', () => {
  assert.deepEqual(selectDatasets({}), []);
  assert.deepEqual(selectDatasets({ result: { results: [] } }), []);
});

test('mapFacilities keeps only the qualifying rows', () => {
  const events = mapFacilities([row(), row({ 名称: '中野区立総合体育館', カヌー: '無', 弓道: '有' })], source);
  assert.equal(events.length, 1);
});

test('a facility the ward has closed is not a destination', () => {
  assert.equal(mapFacility(row({ 名称: 'あきる野市民プール（屋外）（令和8年まで閉場）', 水泳: '有' }), source), null);
});

test('an ordinary weekly rest day does not close a facility', () => {
  // 「第２・４火曜日休館日」 lives in the opening-hours field and means the pool
  // is shut on Tuesdays, not shut down. Reading it as out-of-service would drop
  // a working facility, so only the name is checked.
  const event = mapFacility(row({
    名称: '（多摩市立温水プール）アクアブルー多摩',
    水泳: '有',
    利用可能曜日: '月火水木金土日（第２・４火曜日休館日）',
  }), source);
  assert.ok(event, 'a weekly closure must not remove the facility');
  assert.match(event.time, /休館日/, 'the caveat is still shown to the reader');
});
