import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const UTOKYO_EVENTS_URL = 'https://www.u-tokyo.ac.jp/ja/';

const compact = (value = '') => value.replace(/\s+/g, ' ').trim();

function datesFrom(value = '') {
  const dates = [...value.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g)].map((match) => dateFrom(match[0]));
  return { startDate: dates[0] ?? null, endDate: dates[1] ?? undefined };
}

/** Parse the public event cards on UTokyo's official homepage. */
export function parseUTokyoEvents(html, source = { name: '東京大学', origin: 'https://www.u-tokyo.ac.jp' }) {
  const $ = cheerio.load(html);
  const events = [];
  $('.p-top-events__item').each((index, node) => {
    const card = $(node);
    const link = card.find('a').first();
    const title = compact(card.find('.p-top-events__item-title').text());
    const period = compact(card.find('.p-top-events__item-date').text());
    const { startDate, endDate } = datesFrom(period);
    if (!title || !startDate) return;
    const audience = compact(card.find('.p-top-events__tag').map((_, tag) => $(tag).text()).get().join(' / '));
    const description = compact(card.find('.p-top-events__item-body').text()).replace(period, '').replace(title, '').trim();
    const href = link.attr('href');
    const sourceUrl = href ? new URL(href, source.origin || UTOKYO_EVENTS_URL).href : source.url;
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl,
      title,
      startDate,
      endDate,
      place: audience || '东京大学 · 详见活动页',
      text: `${description} ${audience}`,
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, audience, description });
  });
  return events;
}
