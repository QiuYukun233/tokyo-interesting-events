import test from 'node:test';
import assert from 'node:assert/strict';
import { CORICH_URLS, parseCorich, parsePeriod } from './corich.mjs';

const source = { name: 'CoRich舞台芸術！' };

const listItem = ({ id = '481697', pref = '東京都', stage = '力！伊藤蘭、魔を断つ', group = '劇団森', theater = '早稲田大学学生会館', period = '2026/08/28 (金) ～ 2026/08/30 (日)', price = '1,500円 ～ 5,000円', mitai = '0', mitekita = '0' }) => `
<a href="/stage/${id}" class="list-group-item box ">
  <div class="pict"><img alt="${stage}" src="https://stage-image.corich.jp/img_stage/m/x.gif" /></div>
  <div class="name">
    <p class="stage">${stage}</p>
    <p class="group">${group}</p>
    <p class="theater">${theater}<span class="pref">（${pref}）</span></p>
    <div class="data">
      <div class="mouth mitai"><span class="count">${mitai}<span>人</span></span></div>
      <div class="mouth mitekita"><span class="count">${mitekita}<span>人</span></span></div>
    </div>
    <p class="period"><i class="fa fa-calendar"></i>${period}<span class="icon icon NOW">上演中</span></p>
    <p class="price"><i class="fa fa-jpy"></i>${price}</p>
  </div>
</a>`;

const page = (...items) => `<html><body><div class="list-group">${items.join('\n')}</div></body></html>`;

test('date ranges and single dates both parse', () => {
  assert.deepEqual(parsePeriod('2026/08/28 (金) ～ 2026/08/30 (日)'), { startDate: '2026-08-28', endDate: '2026-08-30' });
  assert.deepEqual(parsePeriod('2026/08/28 (金) ～ 2026/08/28 (金)'), { startDate: '2026-08-28', endDate: null });
  assert.deepEqual(parsePeriod('未定'), { startDate: null, endDate: null });
});

test('only Tokyo venues are kept; other prefectures are dropped', () => {
  const html = page(listItem({ id: '1', pref: '東京都' }), listItem({ id: '2', pref: '宮城県' }));
  const events = parseCorich(html, source);
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceUrl, 'https://stage.corich.jp/stage/1');
});

test('the theater name is extracted without the trailing prefecture tag', () => {
  const [event] = parseCorich(page(listItem({ theater: '早稲田小劇場どらま館' })), source);
  assert.equal(event.place, '早稲田小劇場どらま館');
  assert.ok(!event.place.includes('東京都'));
});

test('the troupe/producer becomes attribution, not the title', () => {
  const [event] = parseCorich(page(listItem({ group: 'ガガ' })), source);
  assert.equal(event.attribution, 'ガガ');
});

test('genre is not filtered — rakugo, kabuki-flavoured and mainstream titles all survive', () => {
  // The whole point of this source: no popularity or category gate at parse time.
  const html = page(
    listItem({ id: '1', stage: '柳家わさび 落語会' }),
    listItem({ id: '2', stage: 'ミュージカル『陽だまり』' }),
    listItem({ id: '3', stage: '一人芝居「独白」' }),
  );
  assert.equal(parseCorich(html, source).length, 3);
});

test('a listing with no parseable date is dropped rather than guessed', () => {
  assert.deepEqual(parseCorich(page(listItem({ period: '日程未定' })), source), []);
});

test('観たい/観てきた counts are summed into popularity', () => {
  // 想看数+看过数：唯一的口碑信号，用于把有人气的公演顶到判决队列前面。
  const [event] = parseCorich(page(listItem({ mitai: '19', mitekita: '3' })), source);
  assert.equal(event.popularity, 22);
});

test('a zero count is recorded as 0, not dropped — observed-zero is information', () => {
  const [event] = parseCorich(page(listItem({ mitai: '0', mitekita: '0' })), source);
  assert.equal(event.popularity, 0);
});

test('a listing without the count block leaves popularity undefined', () => {
  const bare = listItem({ id: '9' }).replace(/<div class="data">[\s\S]*?<\/div>\s*<\/div>/, '');
  const [event] = parseCorich(page(bare), source);
  assert.equal(event.popularity, undefined);
});

test('a missing price falls back to the site default text', () => {
  const [event] = parseCorich(page(listItem({ price: '' })), source);
  assert.equal(event.price, '详见活动页');
});

test('the page list covers both listing modes and stays within the confirmed page ceilings', () => {
  assert.ok(CORICH_URLS.some((url) => url.includes('type=now')));
  assert.ok(CORICH_URLS.some((url) => url.includes('type=start')));
  assert.equal(CORICH_URLS.filter((url) => url.includes('type=now')).length, 6);
  assert.equal(CORICH_URLS.filter((url) => url.includes('type=start')).length, 30);
  assert.equal(new Set(CORICH_URLS).size, CORICH_URLS.length);
});
