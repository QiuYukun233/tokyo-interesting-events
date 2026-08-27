import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTokyoBigSight } from './tokyo-big-sight-v2.mjs';

const source = { name: 'Tokyo Big Sight', url: 'https://www.bigsight.jp/visitor/event/', origin: 'https://www.bigsight.jp' };
const fixture = `<article class="lyt-event-01"><h3 class="hdg-01"><a href="https://example.test/toy">TOKYOおもちゃショー2026<svg><title>新規タブで開きます</title></svg></a></h3><p>玩具の商談見本市及び一般公開</p><div class="content"><dl class="list-01"><div><dt>入場区分</dt><dd>商談/一般</dd></div><div><dt>利用施設</dt><dd>西1-4ホール</dd></div><div><dt>開催期間</dt><dd>2026年08月27日（木）～2026年08月30日（日）</dd></div><div><dt>開催時間</dt><dd>10:00-17:00</dd></div><div><dt>料金</dt><dd>￥2200</dd></div></dl></div></article>`;

test('normalizes a Big Sight public event card with range and facility', () => {
  const [event] = parseTokyoBigSight(fixture, source);
  assert.equal(event.title, 'TOKYOおもちゃショー2026');
  assert.equal(event.startDate, '2026-08-27');
  assert.equal(event.endDate, '2026-08-30');
  assert.equal(event.place, '东京Big Sight · 西1-4ホール');
  assert.equal(event.time, '10:00-17:00');
  assert.equal(event.price, '￥2200');
  assert.equal(event.sourceUrl, 'https://example.test/toy');
});
