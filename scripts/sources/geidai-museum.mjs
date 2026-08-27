import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const GEIDAI_MUSEUM_ORIGIN = 'https://museum.geidai.ac.jp';

function endDateFrom(text = '') {
  const matches = [...text.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g)];
  return matches.length > 1 ? dateFrom(matches.at(-1)[0]) : undefined;
}

export function parseGeidaiMuseum(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('span.exhibit_block').each((index, element) => {
    const block = $(element);
    const anchor = block.closest('a');
    const title = block.find('.title').first().text().replace(/\s+/g, ' ').trim();
    const period = block.find('.excerpt').not('.above').first().text().replace(/\s+/g, ' ').trim();
    const status = block.find('.open').first().text().trim();
    const href = anchor.attr('href');
    const startDate = dateFrom(period);
    if (!title || !href || !startDate || !/開催中|予告|これから/.test(status)) return;
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, source.origin || GEIDAI_MUSEUM_ORIGIN).href,
      title,
      startDate,
      endDate: endDateFrom(period),
      place: source.place || '东京艺术大学大学美术馆 · 上野',
      time: period,
      price: '详见展览页',
      text: '美術 展覧会 大学博物館',
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, category: '大学美术馆展览' });
  });
  return events;
}
