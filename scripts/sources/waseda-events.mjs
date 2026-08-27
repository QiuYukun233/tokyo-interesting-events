import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const WASEDA_EVENTS_URL = 'https://www.waseda.jp/top/event/list';
const HARD_EXCLUDE = /入試|受験|進学|オープンキャンパス|キャリア|採用|就職|説明会|教職員限定|在学生限定|オンラインのみ/i;
const FRIEND_WORTHY = /展|展示|博物館|美術|文学|映画|上映|演奏|コンサート|公演|祭|フェス|トーク|講演|公開|観戦|ワークショップ|体験|ツアー|建築|文化/i;

function isoDatesFromClass(value = '') {
  return [...value.matchAll(/js-event-date-(20\d{2}-\d{2}-\d{2})/g)].map((match) => match[1]);
}

export function parseWasedaEvents(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('.cal-event--listWrap--list').each((index, element) => {
    const card = $(element);
    const titleLink = card.find('.cal-event--list--summary--title a').first();
    const title = titleLink.text().replace(/\s+/g, ' ').trim();
    const href = titleLink.attr('href');
    const place = card.find('.cal-icon-spot').first().text().replace(/\s+/g, ' ').trim();
    const time = card.find('.cal-icon-time').first().text().replace(/\s+/g, ' ').trim();
    const period = card.find('.cal-icon-date').first().text().replace(/\s+/g, ' ').trim();
    const dates = isoDatesFromClass(card.attr('class'));
    if (!title || !href || !dates.length || HARD_EXCLUDE.test(`${title} ${place}`) || !FRIEND_WORTHY.test(`${title} ${place}`)) return;
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, source.origin || 'https://www.waseda.jp').href,
      title,
      startDate: dates[0],
      endDate: dates.at(-1),
      place: place || '早稻田大学 · 东京都内校区',
      time: [period, time].filter(Boolean).join(' · ') || '详见活动页',
      price: '详见活动页',
      text: `${title} ${place}`,
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, category: '大学公开活动' });
  });
  return events;
}
