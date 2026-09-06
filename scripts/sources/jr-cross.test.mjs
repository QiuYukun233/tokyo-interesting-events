import test from 'node:test';
import assert from 'node:assert/strict';
import { findTokyoFacility, jrCrossNewsUrl, lifecycleTypeFor, parseJrCross, publicationDate, titledChangeDate } from './jr-cross.mjs';

const source = { name: 'JR-Cross', origin: 'https://www.jr-cross.co.jp' };
const item = ({ companyid = 'dev', date = '2026年8月20日', text, url = '/info/items/release.pdf' }) =>
  `<item><date>${date}</date><companyid>${companyid}</companyid><text>${text}</text><url>${url}</url><thumbnail>/info/items/ignored.jpg</thumbnail></item>`;
const xml = (items) => `<?xml version="1.0"?><newsdata>${items.join('')}</newsdata>`;

test('only Development Company Tokyo lifecycle notices become one candidate each', () => {
  const events = parseJrCross(xml([
    item({ text: 'グランスタ東京 地下丸の内改札内エリアが2026年9月16日(水)オープン！全26ショップを公開' }),
    item({ date: '2026年4月14日', text: 'JR渋谷駅 新南改札内外の新エリアに4ショップがオープン！！' }),
    item({ companyid: 'ret', text: 'JR東京駅のNewDaysがオープン' }),
    item({ text: '新店舗オープンのお知らせ（会場は横浜駅）' }),
    item({ text: 'エキュート品川 春の新商品フェアを開催' }),
    item({ text: '東京駅 校内店がオープン' }),
    item({ text: 'グランスタ東京の限定商品を販売開始' }),
  ]), source);

  assert.equal(events.length, 2);
  assert.equal(events[0].startDate, '2026-09-16');
  assert.equal(events[0].place, '东京站 · Gransta');
  assert.equal(events[0].changeType, 'opening');
  assert.equal(events[0].sourceUrl, 'https://www.jr-cross.co.jp/info/items/release.pdf');
  assert.equal(events[0].attribution, 'JR-Cross デベロップメントカンパニー公式公告');
  assert.equal(events[0].ongoing, true);
  assert.match(events[0].description, /标题所载/);
  assert.equal(events[1].startDate, '2026-04-14');
  assert.match(events[1].time, /公告发布日期/);
  assert.match(events[1].description, /公告发布日期/);
  assert.ok(!events[0].description.includes('全26ショップ'), 'PDF/title prose is not copied into a description');
});

test('Tokyo destinations and change types are explicit rather than generic station retail', () => {
  assert.equal(findTokyoFacility('JR立川駅「エキュート立川」がリニューアル').place, '立川站 · Ecute');
  assert.equal(findTokyoFacility('エキュート日暮里が新装オープン').place, '日暮里站');
  assert.equal(findTokyoFacility('エキュート最新情報'), null);
  assert.equal(lifecycleTypeFor('JR上野駅の店舗が閉店'), 'closing');
  assert.equal(lifecycleTypeFor('JR秋葉原駅の店舗が移転'), 'discovery');
  assert.equal(lifecycleTypeFor('東京駅でキャンペーンを開催'), null);
  assert.equal(lifecycleTypeFor('東京駅の限定商品を販売開始'), null);
  assert.equal(lifecycleTypeFor('エキュート秋葉原 開業1周年'), null);
  assert.equal(lifecycleTypeFor('エキュート御茶ノ水 5/14に全面開業から1年を迎えます'), null);
});

test('publication and title dates accept JR-Cross spacing and year rollover', () => {
  assert.equal(publicationDate('2026年9月 3日'), '2026-09-03');
  assert.equal(titledChangeDate('2026年9月16日（水）にオープン', '2026-08-20'), '2026-09-16');
  assert.equal(titledChangeDate('1月5日オープン', '2026-12-20'), '2027-01-05');
  assert.equal(titledChangeDate('オープン予定', '2026-08-20'), null);
});

test('the news-list URL follows the Tokyo calendar year', () => {
  assert.equal(jrCrossNewsUrl(new Date('2026-12-31T15:01:00Z')), 'https://www.jr-cross.co.jp/info/xml/newslist_2027.xml');
});
