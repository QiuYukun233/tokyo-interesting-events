import test from 'node:test';
import assert from 'node:assert/strict';
import { TEDUKURIICHI_URLS, parseTedukuriichi, parseDateRange, parseName } from './tedukuriichi.mjs';

const source = { name: 'ものづくり応援団' };

const row = ({
  id = '173', name = '布多天神社つくる市 (9月東京都調布市)  毎月第1日曜',
  date = '2026/09/06(日)～2026/09/06(日)', recruiting = '現在募集未定', status = '募集未定',
} = {}) => `
              <tr>
                <td class="layout_3_9">
                                <img src="sozai/p_7_4.gif" alt="${status}" width="85" height="27" />
                                </td>
                <td class="layout_3_16">${name}</td>
                <td class="layout_3_9">${date}</td>
                <td class="layout_3_9">${recruiting}</td>
                <td class="layout_3_17_2"><a href="index.php?mono=event&event_id=${id}" class="text_layout_7">詳細</a></td>
              </tr>`;

const page = (...rows) => `<html><body><div class="main_contents_layout_3">
            <table class="layout_3_8" width="720" cellpadding="0" cellspacing="0">
              <tr>
                <td class="layout_3_19" width="95">募集</td>
                <td class="layout_3_19">手作り市の名前</td>
                <td class="layout_3_19" width="100">開催日時</td>
                <td class="layout_3_19" width="130">募集期間</td>
                <td class="layout_3_19_2" width="90">詳細</td>
              </tr>${rows.join('\n')}
            </table></div></body></html>`;

test('URL list is the Tokyo prefecture schedule on the www host', () => {
  assert.deepEqual(TEDUKURIICHI_URLS, ['https://www.tedukuriichi.com/index.php?mono=searcheventarea&q=13']);
});

test('date range: single day, multi-day, and text without a concrete date', () => {
  assert.deepEqual(parseDateRange('2026/09/06(日)～2026/09/06(日)'), { startDate: '2026-09-06', endDate: null });
  assert.deepEqual(parseDateRange('2026/11/23(月)～2026/11/24(火)'), { startDate: '2026-11-23', endDate: '2026-11-24' });
  assert.deepEqual(parseDateRange('2026/9/6(日)'), { startDate: '2026-09-06', endDate: null });
  assert.deepEqual(parseDateRange('毎月第1日曜'), { startDate: null, endDate: null });
  assert.deepEqual(parseDateRange('未定'), { startDate: null, endDate: null });
});

test('name cell: parenthetical month/prefecture/city and recurrence phrase are split off the title', () => {
  assert.deepEqual(parseName('布多天神社つくる市 (9月東京都調布市)  毎月第1日曜'), {
    title: '布多天神社つくる市', prefecture: '東京都', city: '調布市', recurrence: '毎月第1日曜',
  });
  assert.deepEqual(parseName('深大寺 手作り市 (10月東京都調布市) '), {
    title: '深大寺 手作り市', prefecture: '東京都', city: '調布市', recurrence: null,
  });
  assert.deepEqual(parseName('お薬師さんの手づくり市（9月・宮城県）毎月8日定期開催！'), {
    title: 'お薬師さんの手づくり市', prefecture: '宮城県', city: null, recurrence: '毎月8日定期開催！',
  });
  assert.deepEqual(parseName('ひだ国分寺八日市（9月・岐阜県）毎月8日※5月～10月'), {
    title: 'ひだ国分寺八日市', prefecture: '岐阜県', city: null, recurrence: '毎月8日※5月～10月',
  });
  assert.deepEqual(parseName('甚目寺観音てづくり朝市(9月愛知県)毎月１２日開催'), {
    title: '甚目寺観音てづくり朝市', prefecture: '愛知県', city: null, recurrence: '毎月１２日開催',
  });
  // No parenthetical, no prefecture anywhere: nothing to filter on.
  assert.deepEqual(parseName('9/13百貨創作祭　神戸 名谷駅前広場'), {
    title: '9/13百貨創作祭 神戸 名谷駅前広場', prefecture: null, city: null, recurrence: null,
  });
  // A prefecture named outside the parenthetical still counts.
  assert.equal(parseName('暮らしとアート市 in 尾道（広島県）').prefecture, '広島県');
});

test('parses one row into a candidate: title, place, dates, category, description', () => {
  const [event] = parseTedukuriichi(page(row()), source);
  assert.equal(event.title, '布多天神社つくる市');
  assert.equal(event.sourceUrl, 'https://www.tedukuriichi.com/index.php?mono=event&event_id=173');
  assert.equal(event.startDate, '2026-09-06');
  assert.equal(event.endDate, undefined);
  assert.equal(event.place, '東京都調布市');
  assert.equal(event.category, '手作り市');
  assert.equal(event.source, 'ものづくり応援団');
  assert.equal(event.description, '定期 毎月第1日曜｜出店募集 現在募集未定');
});

test('multi-day market carries an endDate; non-recurring row has no 定期 note', () => {
  const [event] = parseTedukuriichi(page(row({ id: '2998', name: '深大寺 手作り市 (9月東京都調布市) ', date: '2026/09/20(日)～2026/09/23(水)', recruiting: '募集終了', status: '締め切り' })), source);
  assert.equal(event.title, '深大寺 手作り市');
  assert.equal(event.startDate, '2026-09-20');
  assert.equal(event.endDate, '2026-09-23');
  assert.equal(event.description, '出店募集 募集終了');
});

test('a recurring market listed for two months yields two candidates with distinct ids', () => {
  const events = parseTedukuriichi(page(
    row({ id: '173', name: '布多天神社つくる市 (9月東京都調布市)  毎月第1日曜', date: '2026/09/06(日)～2026/09/06(日)' }),
    row({ id: '174', name: '布多天神社つくる市 (10月東京都調布市)  毎月第1日曜', date: '2026/10/04(日)～2026/10/04(日)' }),
  ), source);
  assert.deepEqual(events.map((e) => e.startDate), ['2026-09-06', '2026-10-04']);
  assert.notEqual(events[0].id, events[1].id);
  assert.deepEqual(events.map((e) => e.title), ['布多天神社つくる市', '布多天神社つくる市']);
});

test('a recurring row without a concrete date is skipped rather than guessed', () => {
  const events = parseTedukuriichi(page(row({ id: '9', date: '毎月第1日曜' })), source);
  assert.deepEqual(events, []);
});

test('rows naming another prefecture are dropped; rows naming none are kept', () => {
  const events = parseTedukuriichi(page(
    row({ id: '1', name: 'お薬師さんの手づくり市（9月・宮城県）毎月8日定期開催！', date: '2026/09/08(火)～2026/09/08(火)' }),
    row({ id: '2', name: '百万遍手づくり市 (９月・京都府)毎月１５日', date: '2026/09/15(火)～2026/09/15(火)' }),
    row({ id: '3', name: '9/13百貨創作祭　神戸 名谷駅前広場', date: '2026/09/13(日)～2026/09/13(日)' }),
    row({ id: '4' }),
  ), source);
  assert.deepEqual(events.map((e) => e.sourceUrl.split('event_id=')[1]), ['3', '4']);
  assert.equal(events[0].place, '東京都 · 详见活动页');
});

test('source.prefecture switches the kept prefecture', () => {
  const events = parseTedukuriichi(page(
    row({ id: '1', name: 'お薬師さんの手づくり市（9月・宮城県）毎月8日定期開催！', date: '2026/09/08(火)～2026/09/08(火)' }),
    row({ id: '4' }),
  ), { ...source, prefecture: '宮城県' });
  assert.deepEqual(events.map((e) => e.title), ['お薬師さんの手づくり市']);
});

test('header row and rows without a detail link are ignored', () => {
  const html = page(`<tr><td class="layout_3_9"></td><td class="layout_3_16">壊れた行</td><td class="layout_3_9">2026/09/06(日)</td><td class="layout_3_9"></td><td class="layout_3_17_2"></td></tr>`);
  assert.deepEqual(parseTedukuriichi(html, source), []);
});
