import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIkebukuroKeizaiArticle, parseIkebukuroKeizaiHomepage } from './ikebukuro-keizai-shop-changes-v1.mjs';

const source = { name: '池袋経済新聞', url: 'https://ikebukuro.keizai.biz/' };
const homepage = `<div id="topBox"><a href="https://ikebukuro.keizai.biz/headline/3971/"><span>買う</span><h3>ディスクユニオン池袋店が移転オープン</h3></a><a href="https://ikebukuro.keizai.biz/headline/1/"><h3>池袋の店が閉店へ</h3></a><a href="https://ikebukuro.keizai.biz/headline/2/"><h3>盆踊り開催</h3></a></div>`;
const article = `<meta name="description" content="「ディスクユニオン池袋店」（豊島区南池袋2）が8月26日、移転オープンする。"><time>2026.08.25</time>`;

test('selects only shop-change leads and deduplicates by article URL', () => {
  const leads = parseIkebukuroKeizaiHomepage(homepage, source);
  assert.deepEqual(leads.map(({ title, changeType }) => ({ title, changeType })), [{ title: 'ディスクユニオン池袋店が移転オープン', changeType: 'opening' }, { title: '池袋の店が閉店へ', changeType: 'closing' }]);
});

test('uses article metadata only to derive factual fields without retaining description', () => {
  const [lead] = parseIkebukuroKeizaiHomepage(homepage, source);
  const event = parseIkebukuroKeizaiArticle(article, lead, source);
  assert.equal(event.startDate, '2026-08-26');
  assert.equal(event.place, '豊島区南池袋2');
  assert.equal(event.changeType, 'opening');
  assert.equal(event.description, undefined);
  assert.equal(event.attribution, '池袋経済新聞');
});
