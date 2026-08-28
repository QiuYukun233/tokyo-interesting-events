import test from 'node:test';
import assert from 'node:assert/strict';
import { listUrl, parseBunfree, parseEditionMeta } from './bunfree.mjs';

const source = { name: '文学フリマ東京42', edition: 'tokyo42', startDate: '2026-05-04', venue: '東京ビッグサイト' };

const head = (description = '「文学フリマ東京42」(2026/5/4、東京ビッグサイト) の全出店者リストです。', title = '文学フリマ東京42 出店者リスト') =>
  `<head><meta content="${description}" name="description" /><meta content="${title}" property="og:title" /></head>`;

const row = ({ name = 'カニエ・ナハ', id = '59770', space = '南3-4ホール&nbsp;い-38', category = '詩歌|現代詩・散文詩', edition = 'tokyo42' } = {}) => `
<tr>
  <td><button class="flag btn" kind="watch"><span>気になる!</span></button><button class="flag btn" kind="done"><span>訪問済</span></button></td>
  <td>${space}</td>
  <td>${name ? `<a href="/c/${edition}/${id}">${name}</a>` : ''}</td>
  <td>${category}</td>
</tr>`;

const page = (...rows) => `<html>${head()}<body><table><tbody>${rows.join('')}</tbody></table></body></html>`;

test('the edition date, name and venue are read from the page rather than hardcoded', () => {
  assert.deepEqual(parseEditionMeta(page()), {
    name: '文学フリマ東京42', startDate: '2026-05-04', venue: '東京ビッグサイト',
  });
});

test('a header without the parenthesised date reports nulls instead of guessing', () => {
  const html = `<html>${head('出店者リストです。', '文学フリマ東京43 出店者リスト')}<body></body></html>`;
  const meta = parseEditionMeta(html);
  assert.equal(meta.name, '文学フリマ東京43');
  assert.equal(meta.startDate, null);
  assert.equal(meta.venue, null);
});

test('a row maps to a candidate with its hall, booth and two-level category', () => {
  const [event] = parseBunfree(page(row()), source);
  assert.equal(event.title, 'カニエ・ナハ');
  assert.equal(event.startDate, '2026-05-04');
  assert.equal(event.place, '東京ビッグサイト · 南3-4ホール い-38');
  assert.equal(event.category, '詩歌|現代詩・散文詩');
  assert.equal(event.sourceUrl, 'https://c.bunfree.net/c/tokyo42/59770');
});

test('the non-breaking space between hall and booth is normalised', () => {
  const [event] = parseBunfree(page(row({ space: '南1-2ホール&nbsp;H-27' })), source);
  assert.ok(event.place.endsWith('南1-2ホール H-27'), event.place);
});

test('a booth spanning two spaces is kept verbatim', () => {
  const [event] = parseBunfree(page(row({ space: '南1-2ホール&nbsp;H-49〜50' })), source);
  assert.ok(event.place.endsWith('H-49〜50'), event.place);
});

test('rows with no exhibitor link — headers, flag-only rows — are skipped', () => {
  assert.equal(parseBunfree(page(row({ name: '' })), source).length, 0);
  assert.equal(parseBunfree('<html><body><table><tr><th>ブース</th><th>出店名</th></tr></table></body></html>', source).length, 0);
});

test('every exhibitor gets a distinct id', () => {
  const events = parseBunfree(page(row(), row({ name: 'かに温泉', id: '55936' })), source);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
});

test('a row from a different edition on the same page is not picked up', () => {
  // The link selector is scoped to the edition being collected.
  assert.equal(parseBunfree(page(row({ edition: 'tokyo41' })), source).length, 0);
});

test('an exhibitor with no category still becomes a candidate', () => {
  const [event] = parseBunfree(page(row({ category: '' })), source);
  assert.ok(event);
  assert.ok(!('category' in event));
});

test('the all-exhibitors URL covers both orderings', () => {
  assert.equal(listUrl('tokyo42'), 'https://c.bunfree.net/c/tokyo42/all/50');
  assert.equal(listUrl('tokyo42', 'booth'), 'https://c.bunfree.net/c/tokyo42/all/booth');
});
