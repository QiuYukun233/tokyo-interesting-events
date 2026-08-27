import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIkebukuroKeizaiArticle, parseIkebukuroKeizaiHomepage } from './ikebukuro-keizai-shop-changes-v2.mjs';

const source = { name: '池袋経済新聞', url: 'https://ikebukuro.keizai.biz/' };
const homepage = `<a href="https://ikebukuro.keizai.biz/headline/3971/"><span>買う</span><h3>ディスクユニオン池袋店が移転オープン</h3></a><a href="https://ikebukuro.keizai.biz/headline/3982/"><h3>西武池袋で地下食品フロアリニューアル1周年記念企画</h3></a><a href="https://ikebukuro.keizai.biz/headline/1/"><h3>池袋の店が閉店へ</h3></a>`;
const article = `<meta name="description" content="「ディスクユニオン池袋店」（豊島区南池袋2）が8月26日、移転オープンする。"><time>2026.08.25</time>`;
test('keeps store changes while rejecting anniversary promotion noise', () => { assert.deepEqual(parseIkebukuroKeizaiHomepage(homepage, source).map((item) => item.title), ['ディスクユニオン池袋店が移転オープン', '池袋の店が閉店へ']); });
test('derives factual metadata without retaining the source summary', () => { const [lead] = parseIkebukuroKeizaiHomepage(homepage, source); const event = parseIkebukuroKeizaiArticle(article, lead, source); assert.equal(event.startDate, '2026-08-26'); assert.equal(event.place, '豊島区南池袋2'); assert.equal(event.description, undefined); assert.equal(event.attribution, '池袋経済新聞'); });
