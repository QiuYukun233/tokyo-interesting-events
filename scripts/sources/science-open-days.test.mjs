import test from 'node:test';
import assert from 'node:assert/strict';
import { editionYear, eventDateRange, parseAistOpenDay, parseScienceAgora } from './science-open-days.mjs';

test('AIST open day keeps dates and turns research demos into a concise internal summary', () => {
  const html = `<main><p>2026/07/06</p><h2>産総研臨海副都心センター 一般公開2026</h2>
    <p>2026年9月12日（土）・13日（日）</p><p>どなたでも参加OK・入場料：無料</p>
    <p>つながる工場、ミニマルファブ、移動ロボットの遠隔操作体験、次世代モーションキャプチャー</p></main>`;
  const [item] = parseAistOpenDay(html, { name: 'AIST', url: 'https://www.aist.go.jp/x' });
  assert.equal(item.startDate, '2026-09-12');
  assert.equal(item.endDate, '2026-09-13');
  assert.equal(item.changeType, 'special_access');
  assert.match(item.description, /微型半导体工厂/);
  assert.equal(item.sourceUrl, 'https://www.aist.go.jp/x');
});

test('AIST rejects ordinary research news and non-public pages', () => {
  assert.deepEqual(parseAistOpenDay('<main><h1>研究成果</h1><p>2026年9月12日</p></main>'), []);
});

test('Science Agora becomes one trip, not one candidate per booth', () => {
  const html = `<main><h1>サイエンスアゴラ 2026</h1><p>開催日 2026年9月12日（土）～9月13日（日）</p>
    <p>入場料 無料 来場に際し事前登録は不要</p>
    <p>植物の感覚、3Dプリンタ、超音波で物体を浮遊、量子センサー、JAXA</p></main>`;
  const rows = parseScienceAgora(html, { name: 'JST', url: 'https://www.jst.go.jp/x' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].endDate, '2026-09-13');
  assert.match(rows[0].description, /超声悬浮/);
});

test('date ranges ignore a preceding publication date', () => {
  assert.deepEqual(eventDateRange('2026年7月6日 更新。開催は2026年9月12日（土）・13日（日）'), {
    startDate: '2026-09-12', endDate: '2026-09-13',
  });
});

test('annual URL year changes in June using the Tokyo calendar', () => {
  assert.equal(editionYear(new Date('2027-05-31T15:00:00Z')), 2027);
  assert.equal(editionYear(new Date('2027-05-31T14:59:59Z')), 2026);
});
