import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';

test('My TOKYO adapter parses cards through the DOM', () => {
  const html = `<ul><li class="widget-event-result_list-item"><a class="card-event_inner" href="/w/123"><div class="card-event_title">ロボット体験展</div><div class="card-event_meta-area">東京ビッグサイト</div><div class="card-event_meta-period">2026年09月12日～2026年09月13日</div></a></li></ul>`;
  const events = parseMyTokyo(html, { name: 'My TOKYO', origin: 'https://www.my.metro.tokyo.lg.jp' });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, 'ロボット体験展');
  assert.equal(events[0].startDate, '2026-09-12');
  assert.equal(events[0].sourceUrl, 'https://www.my.metro.tokyo.lg.jp/w/123');
});

test('RSS adapter delegates feed parsing to Feedsmith', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><link>https://example.test</link><description>Fixture</description><item><title>夜の科学体験イベント 2026年9月20日</title><link>https://example.test/event</link><description><![CDATA[一般公開の展示です]]></description></item></channel></rss>`;
  const events = parseRss(xml, { name: 'Fixture Feed' });
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-09-20');
  assert.equal(events[0].source, 'Fixture Feed');
});
