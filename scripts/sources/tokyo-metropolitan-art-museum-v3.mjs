import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const TOKYO_METROPOLITAN_ART_MUSEUM_URL = 'https://www.tobikan.jp/exhibition/';

function compact(value = '') { return value.replace(/\s+/g, ' ').trim(); }

function periodDates(period = '') {
  const dates = [...period.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g)].map((match) => dateFrom(match[0]));
  return { startDate: dates[0] ?? null, endDate: dates[1] ?? undefined };
}

function isCurrentOrUpcoming(section) {
  return /開催中|これから開催/.test(compact(section.find('.section-header-title').first().text()));
}

/** Official Tokyo Metropolitan Art Museum current/upcoming exhibition adapter. */
export function parseTokyoMetropolitanArtMuseum(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('section').each((_, sectionNode) => {
    const section = $(sectionNode);
    if (!isCurrentOrUpcoming(section)) return;
    section.find('a.exhibition-item').each((index, node) => {
      const item = $(node);
      const titleElement = item.find('.-title').first().clone();
      titleElement.find('br').replaceWith(' ');
      const title = compact(titleElement.text());
      const period = compact(item.find('.-period').text());
      const category = compact(item.find('.-category').text());
      const { startDate, endDate } = periodDates(period);
      if (!title || !startDate) return;
      const href = item.attr('href');
      const candidate = createEventCandidate({
        sourceName: source.name,
        sourceUrl: href ? new URL(href, source.url || TOKYO_METROPOLITAN_ART_MUSEUM_URL).href : source.url,
        title, startDate, endDate,
        place: '东京都美术馆 · 上野', time: period, price: '详见活动页',
        text: category, visualIndex: events.length + index,
      });
      if (candidate) events.push({ ...candidate, category, description: category || undefined });
    });
  });
  return events;
}
