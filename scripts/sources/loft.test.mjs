import test from 'node:test';
import assert from 'node:assert/strict';
import { LOFT_VENUES, loftUrls, parseLoft, parseOpenStart } from './loft.mjs';

const source = { name: '阿佐ヶ谷ロフトA', venue: LOFT_VENUES.find((v) => v.key === 'lofta') };

const column = ({
  id = '360999', year = '2026', month = '09', day = '01', title = '＃あかたま　海釣り',
  open = 'OPEN 19:00 - START 19:30', artists = ['小明', '姫乃たま'], steam = null, soldout = false,
} = {}) => `
<div class="column fade_up">
  <a href="https://www.loft-prj.co.jp/schedule/lofta/${id}" class="js-cursor-elm">
    <time><div class="year">${year}</div><div class="month">${month}</div><div class="day">${day}</div><div class="week">Tuesday</div></time>
    <figure>
      <ul class="icon">${steam ? `<li class="steam"><div class="t04">${steam}</div></li>` : ''}</ul>
      <div class="img_wrap"><img class="over lazyload" data-src="x.jpg" alt=""></div>
    </figure>
    <div class="textarea">
      <div class="c_title"><span>${title}</span></div>
      <div class="open">
        ${open}      </div>
      <ul class="artist_tag">${artists.map((a) => `<li type="free" artist-id="${id}">${a}</li>`).join('')}</ul>
    </div>
  </a>
  ${soldout ? '<p class="soldout">このイベントの予約は締めきりました。</p>' : ''}
</div>`;

const page = (...columns) => `<html><body><div class="inner">${columns.join('\n')}</div></body></html>`;

test('OPEN/START line normalises; partial and free-form lines survive', () => {
  assert.equal(parseOpenStart('\n OPEN 19:00 - START 19:30      '), 'OPEN 19:00 / START 19:30');
  assert.equal(parseOpenStart('START 12:00'), 'START 12:00');
  assert.equal(parseOpenStart('昼夜二部制'), '昼夜二部制');
  assert.equal(parseOpenStart(''), null);
});

test('one column becomes a talk-live candidate at the venue with performers in the description', () => {
  const [event] = parseLoft(page(column()), source);
  assert.equal(event.title, '＃あかたま 海釣り');
  assert.equal(event.startDate, '2026-09-01');
  assert.equal(event.sourceUrl, 'https://www.loft-prj.co.jp/schedule/lofta/360999');
  assert.equal(event.place, '阿佐ヶ谷ロフトA（杉並区阿佐谷南）');
  assert.equal(event.time, 'OPEN 19:00 / START 19:30');
  assert.equal(event.category, 'トークライブ');
  assert.equal(event.description, '出演：小明、姫乃たま');
});

test('streaming and sold-out markers land in the description; 配信なし does not count as streaming', () => {
  const [none] = parseLoft(page(column({ steam: '配信<br>なし' })), source);
  assert.equal(none.description, '出演：小明、姫乃たま');
  const [live] = parseLoft(page(column({ steam: '配信<br>あり', soldout: true })), source);
  assert.equal(live.description, '出演：小明、姫乃たま｜配信あり｜予約締切（当日券は会場へ）');
});

test('the "..." overflow item in the performer list is dropped, and an empty list gives no 出演 line', () => {
  const [event] = parseLoft(page(column({ artists: ['萩田頌豊与', '今立進', '...'] })), source);
  assert.equal(event.description, '出演：萩田頌豊与、今立進');
  const [bare] = parseLoft(page(column({ artists: [] })), source);
  assert.equal('description' in bare, false);
});

test('a column with no title or a broken date is skipped', () => {
  const events = parseLoft(page(column({ title: '' }), column({ year: '' }), column({ id: '2' })), source);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceUrl, 'https://www.loft-prj.co.jp/schedule/lofta/2');
});

test('urls cover this month and next in the site\'s own unpadded query format', () => {
  assert.deepEqual(loftUrls('plusone', new Date('2026-12-15T00:00:00Z')), [
    'https://www.loft-prj.co.jp/schedule/plusone/schedule?scheduleyear=2026&schedulemonth=12',
    'https://www.loft-prj.co.jp/schedule/plusone/schedule?scheduleyear=2027&schedulemonth=1',
  ]);
});

test('only Tokyo talk venues are registered', () => {
  assert.deepEqual(LOFT_VENUES.map((v) => v.key), ['plusone', 'lofta', 'loft9', 'rockcafe']);
});
