import * as cheerio from 'cheerio';
import { createEventCandidate, dateFrom } from '../lib/event-utils.mjs';

export const TOKYO_BIG_SIGHT_URL = 'https://www.bigsight.jp/visitor/event/';

const compact = (value = '') => value.replace(/\s+/g, ' ').trim();
const detail = ($, article, label) => article.find('.list-01 > div').filter((_, row) => compact($(row).find('dt').text()) === label).first().find('dd').text();

function periodDates(value = '') {
  const dates = [...value.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g)].map((match) => dateFrom(match[0]));
  return { startDate: dates[0] ?? null, endDate: dates[1] ?? undefined };
}

export function parseTokyoBigSight(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('article.lyt-event-01').each((index, node) => {
    const article = $(node);
    const link = article.find('h3.hdg-01 > a').first().clone();
    link.find('svg').remove();
    const title = compact(link.text());
    const period = compact(detail($, article, '開催期間'));
    const { startDate, endDate } = periodDates(period);
    if (!title || !startDate) return;
    const facility = compact(detail($, article, '利用施設'));
    const audience = compact(detail($, article, '入場区分'));
    const description = compact(article.children('p').first().text());
    const href = article.find('h3.hdg-01 > a').first().attr('href');
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: href ? new URL(href, source.origin || TOKYO_BIG_SIGHT_URL).href : source.url,
      title,
      startDate,
      endDate,
      place: `东京Big Sight${facility ? ` · ${facility}` : ''}`,
      time: compact(detail($, article, '開催時間')) || period,
      price: compact(detail($, article, '料金')) || '详见活动页',
      text: `${description} ${audience}`,
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, audience, description });
  });
  return events;
}
