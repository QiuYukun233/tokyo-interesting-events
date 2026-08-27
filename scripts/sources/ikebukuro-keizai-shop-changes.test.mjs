import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIkebukuroKeizaiArticle, parseIkebukuroKeizaiHomepage } from './ikebukuro-keizai-shop-changes.mjs';
const source = { name: '池袋経済新聞', url: 'https://ikebukuro.keizai.biz/' };
const homepage = `<a href="https://ikebukuro.keizai.biz/headline/3971/"><span>買う</span><h3>ディスクユニオン池袋店が移転オープン</h3></a><a href="https://ikebukuro.keizai.biz/headline/3955/"><h3>盆踊り大会 アルパ各店の出店も</h3></a><a href="https://ikebukuro.keizai.biz/headline/1/"><h3>池袋の店が閉店へ</h3></a>`;
const article = `<meta name="description" content="「ディスクユニオン池袋店」（豊島区南池袋2）が8月26日、移転オープンする。"><time>2026.08.25</time>`;
test('rejects festival stalls while retaining actual openings and closings', () => { assert.deepEqual(parseIkebukuroKeizaiHomepage(homepage, source).map((item) => item.title), ['ディスクユニオン池袋店が移転オープン', '池袋の店が閉店へ']); });
test('derives factual metadata without retaining the article summary', () => { const event = parseIkebukuroKeizaiArticle(article, parseIkebukuroKeizaiHomepage(homepage, source)[0], source); assert.equal(event.startDate, '2026-08-26'); assert.equal(event.place, '豊島区南池袋2'); assert.equal(event.description, undefined); assert.equal(event.attribution, '池袋経済新聞'); });
