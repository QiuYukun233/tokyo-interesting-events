import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShibuyaKeizaiArticle, parseShibuyaKeizaiHomepage } from './shibuya-keizai-shop-changes-v1.mjs';

const source = { name: 'Shibuya Keizai Shimbun', url: 'https://www.shibukei.com/' };
const homepage = `<div id="topBox"><a href="https://www.shibukei.com/headline/20110/"><span>食べる</span><h2>京都発ラーメン店、渋谷に府外初出店</h2></a><a href="https://www.shibukei.com/headline/20109/"><h3>カフェ・ベローチェ渋谷駅店が閉店へ</h3></a><a href="https://www.shibukei.com/headline/20108/"><h3>イベント開催</h3></a></div>`;
const article = `<meta name="description" content="京都発ラーメン店の新店舗（渋谷区宇田川町）が8月28日、渋谷・センター街にオープンする。"><time>2026.08.27</time>`;

test('keeps only opening and closing leads from the homepage', () => {
  const leads = parseShibuyaKeizaiHomepage(homepage, source);
  assert.deepEqual(leads.map(({ title, changeType }) => ({ title, changeType })), [{ title: '京都発ラーメン店、渋谷に府外初出店', changeType: 'opening' }, { title: 'カフェ・ベローチェ渋谷駅店が閉店へ', changeType: 'closing' }]);
});

test('adds article metadata, actual change date, place, and type', () => {
  const [lead] = parseShibuyaKeizaiHomepage(homepage, source);
  const event = parseShibuyaKeizaiArticle(article, lead, source);
  assert.equal(event.startDate, '2026-08-28');
  assert.equal(event.dateKind, 'change');
  assert.equal(event.place, '渋谷区宇田川町');
  assert.equal(event.changeType, 'opening');
  assert.match(event.description, /新店舗/);
});
