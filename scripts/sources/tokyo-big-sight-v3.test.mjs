import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTokyoBigSight } from './tokyo-big-sight-v3.mjs';

test('preserves Big Sight admission type for public-access filtering', () => {
  const html = `<article class="lyt-event-01"><h3 class="hdg-01"><a href="https://example.test/toy">おもちゃショー<svg/></a></h3><p>玩具の展示と一般公開</p><dl class="list-01"><div><dt>入場区分</dt><dd>商談/一般</dd></div><div><dt>利用施設</dt><dd>西1ホール</dd></div><div><dt>開催期間</dt><dd>2026年09月01日～2026年09月02日</dd></div><div><dt>開催時間</dt><dd>10:00-17:00</dd></div><div><dt>料金</dt><dd>無料</dd></div></dl></article>`;
  const [event] = parseTokyoBigSight(html, { name: 'Tokyo Big Sight', url: 'https://www.bigsight.jp/visitor/event/', origin: 'https://www.bigsight.jp' });
  assert.equal(event.audience, '商談/一般');
  assert.equal(event.description, '玩具の展示と一般公開');
});
