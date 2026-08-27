import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const TOKYO_BIG_SIGHT_URL = 'https://www.bigsight.jp/visitor/event/';

function compact(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function detail(article, label) {
  return article.find('.list-01 > div').filter((_, row) => compact(article.constructor(row).find('dt').text()) === label).first().find('dd').text();
}

function periodDates(value = '') {
  const dates = [...value.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g)].map((match) => dateFrom(match[0]));
  return { startDate: dates[0] ?? null, endDate: dates[1] ?? undefined };
}

/** Parse one public Tokyo Big Sight event-list page into normalized candidates. */
export function parseTokyoBigSight(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('article.lyt-event-01').each((index, node) => {
    const article = $(node);
    const link = article.find('h3.hdg-01 > a').first().clone();
    link.find('svg').remove();
    const title = compact(link.text());
    const period = compact(detail(article, '開催期間'));
    const { startDate, endDate } = periodDates(period);
    if (!title || !startDate) return;
    const facility = compact(detail(article, '利用施設'));
    const entryType = compact(detail(article, '入場区分'));
    const time = compact(detail(article, '開催時間')) || period;
    const price = compact(detail(article, '料金')) || '详见活动页';
    const href = article.find('h3.hdg-01 > a').first().attr('href');
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: href ? new URL(href, source.origin || TOKYO_BIG_SIGHT_URL).href : source.url,
      title,
      startDate,
      endDate,
      place: `东京Big Sight${facility ? ` · ${facility}` : ''}`,
      time,
      price,
      text: `${compact(article.children('p').first().text())} ${entryType}`,
      visualIndex: index,
    });
    if (candidate) events.push(candidate);
  });
  return events;
}
