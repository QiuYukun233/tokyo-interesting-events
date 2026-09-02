import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTSENTRY_URLS, parseSportsentry, parseEventDate, parseEntryPeriod } from './sportsentry.mjs';

const source = { name: 'スポーツエントリー' };

const item = ({
  id = '106305', title = 'いざ！スポウォーク 羽田スカイウォーク2026秋', pref = '東京都', category = 'ウォーキング',
  date = '2026年10月3日（土）', place = '大田区　ベルサール羽田空港（スタート・ゴール会場）',
  entry = '[エントリー]2026年7月7日（火）〜2026年9月6日（日）', people = '225人', tags = ['＃アクセス良し', '＃子供参加ＯＫ！'],
  href = `/event/t/${id}`,
} = {}) => `
<div class="detailSingle">
  <div class="detailSingle__Title ">
    <h3><a href="${href}" class="a_under">${title}</a></h3>
    <p class="detailSingle__Title--Place ">${pref}</p>
  </div>
  <div class="sp"><ul class="category"><li class="mainCategory"><p>${category}</p></li></ul></div>
  <div class="detailSingleWrapper">
    <div class="detailSingle__InfoSP"><div class="textArea"><p>${date}</p><p>${place}</p><p>${entry}</p></div></div>
    <div class="detailSingle__Info">
      <ul class="category"><li class="mainCategory"><p>${category}</p></li></ul>
      <div class="textArea"><p>${date}</p><p>${place}</p><p>${entry}</p><p class="mainText"></p></div>
      <p class="tag">${tags.map((t) => `<a href="/events/search/?keyword1=x">${t}</a>`).join(',')}</p>
      <div class="infoDetail">
        <div class="infoDetail__Star tooltip" data-tooltip="注目度"><ul><li>★</li><li>★</li><li>★</li><li>★</li><li>☆</li></ul></div>
        ${people ? `<div class="infoDetail__People"><a href="/comments/index/${id}"><p>${people}</p></a></div>` : ''}
      </div>
      <div class="btnWrapper"><div class="detailBtn"><a href="${href}">詳細を見る</a></div></div>
    </div>
  </div>
</div>`;

const page = (...items) => `<html><body><main class="eventPage eventTop">${items.join('\n')}<div class="pager"></div></main></body></html>`;

test('event dates: single day, same-month range, cross-month range, a listed second day, and none', () => {
  assert.deepEqual(parseEventDate('2027年2月21日（日）'), { startDate: '2027-02-21', endDate: null, time: null });
  assert.deepEqual(parseEventDate('2026年10月3日（土）～4日（日）開催'), { startDate: '2026-10-03', endDate: '2026-10-04', time: null });
  assert.deepEqual(parseEventDate('2026年9月1日(火) ～ 2026年11月2日(月)'), { startDate: '2026-09-01', endDate: '2026-11-02', time: null });
  assert.deepEqual(parseEventDate('2026年4月11日（土）、12日（日）開催'), { startDate: '2026-04-11', endDate: '2026-04-12', time: null });
  assert.deepEqual(parseEventDate('2026年10月18日(日) 9:30-15:00'), { startDate: '2026-10-18', endDate: null, time: '9:30-15:00' });
  assert.deepEqual(parseEventDate('-'), { startDate: null, endDate: null, time: null });
});

test('entry period parses to ISO dates and ignores non-entry text', () => {
  assert.deepEqual(parseEntryPeriod('[エントリー]2026年8月15日（土）〜2026年11月3日（火）'), { entryStart: '2026-08-15', entryEnd: '2026-11-03' });
  assert.deepEqual(parseEntryPeriod('【夏に走るならスポーツワンしかない！】'), null);
});

test('parses one listing item into a candidate with category, popularity and entry period', () => {
  const [event] = parseSportsentry(page(item()), source);
  assert.equal(event.title, 'いざ！スポウォーク 羽田スカイウォーク2026秋');
  assert.equal(event.sourceUrl, 'https://www.sportsentry.ne.jp/event/t/106305');
  assert.equal(event.startDate, '2026-10-03');
  assert.equal(event.endDate, undefined);
  assert.equal(event.place, '大田区 ベルサール羽田空港（スタート・ゴール会場）');
  assert.equal(event.category, 'ウォーキング');
  assert.equal(event.popularity, 225);
  assert.match(event.description, /报名期 2026-07-07 〜 2026-09-06/);
  assert.match(event.description, /アクセス良し/);
});

test('the pinned recommendation carries utm noise in its href; it is stripped so the id is stable', () => {
  const [event] = parseSportsentry(page(item({ href: '/event/t/106511?utm_source=internal&utm_medium=osusume_search&utm_campaign=o106511' })), source);
  assert.equal(event.sourceUrl, 'https://www.sportsentry.ne.jp/event/t/106511');
});

test('items without a date, federation membership registrations (even dated), and outside Tokyo are dropped', () => {
  const html = page(
    item({ id: '1', date: '-', title: '2026年 協会会員登録' }),
    item({ id: '4', date: '2026年4月1日（水）～2027年3月31日（水）', category: '協会連盟登録', title: '2026年度 個人会員登録' }),
    item({ id: '2', pref: '神奈川県' }),
    item({ id: '3' }),
  );
  const events = parseSportsentry(html, source);
  assert.deepEqual(events.map((e) => e.sourceUrl), ['https://www.sportsentry.ne.jp/event/t/3']);
});

test('missing comment count means popularity is absent, not zero', () => {
  const [event] = parseSportsentry(page(item({ people: '' })), source);
  assert.equal('popularity' in event, false);
});

test('a page past the end has no items and parses to nothing', () => {
  assert.deepEqual(parseSportsentry(page(), source), []);
});

test('URL list is upcoming-first (order=opendate) and fixed-length', () => {
  assert.equal(SPORTSENTRY_URLS[0], 'https://www.sportsentry.ne.jp/events/tokyo?order=opendate&page=1');
  assert.ok(SPORTSENTRY_URLS.length >= 30);
  assert.ok(SPORTSENTRY_URLS.every((url) => url.includes('order=opendate')));
});
