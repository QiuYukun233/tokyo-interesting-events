import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const MY_TOKYO_ORIGIN = 'https://www.my.metro.tokyo.lg.jp';

export function parseMyTokyo(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('.widget-event-result_list-item').each((index, element) => {
    const card = $(element);
    const title = card.find('.card-event_title').first().text().replace(/\s+/g, ' ').trim();
    const href = card.find('a.card-event_inner').first().attr('href');
    const place = card.find('.card-event_meta-area').first().text().replace(/\s+/g, ' ').trim() || '东京都内';
    const period = card.find('.card-event_meta-period').first().text().replace(/\s+/g, ' ').trim();
    const startDate = dateFrom(period);
    if (!title || !href || !startDate) return;
    const candidate = createEventCandidate({ sourceName: source.name, sourceUrl: new URL(href, source.origin || MY_TOKYO_ORIGIN).href, title, startDate, place, time: period || '详见活动页', text: card.text(), visualIndex: index });
    if (candidate) events.push(candidate);
  });
  return events;
}
