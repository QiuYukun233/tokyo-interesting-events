import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const SHIBUYA_PARCO_EVENTS_URL = 'https://shibuya.parco.jp/event/';
const INTERESTING = /GALLERY|ART|EXHIBITION|ゲーム|GAME|アート|ART|展示|展|キャラクター|漫画|アニメ|音楽|映画|写真|イラスト|デザイン|限定|コラボ|KOJIMA|城|Castle/i;
const BORING_SALES = /BEAUTY|COSMETIC|ジュエリー|アクセサリー|受注会|セール|ポイント|キャンペーン/i;

function parseDate(value = '') {
  const match = value.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

export function parseShibuyaParcoEvents(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('.c-event-entry').each((index, element) => {
    const card = $(element);
    const title = card.find('.c-event-entry__title').first().text().replace(/\s+/g, ' ').trim();
    const category = card.find('.c-event-entry__category').first().text().replace(/\s+/g, ' ').trim();
    const floor = card.find('.c-event-entry__floor').first().text().replace(/\s+/g, ' ').trim();
    const period = card.find('.c-event-entry__date').first().text().replace(/\s+/g, ' ').trim();
    const href = card.find('a').first().attr('href');
    const imageUrl = card.find('img').first().attr('src');
    const signal = `${title} ${category} ${floor}`;
    const dates = period.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/g) || [];
    const startDate = parseDate(dates[0]);
    if (!title || !href || !startDate || BORING_SALES.test(signal) || !INTERESTING.test(signal)) return;
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, source.origin || 'https://shibuya.parco.jp').href,
      title,
      startDate,
      endDate: parseDate(dates.at(-1)),
      place: `涩谷 PARCO${floor ? ` · ${floor}` : ''}`,
      time: period || '详见活动页',
      price: '详见活动页',
      text: signal,
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, category: category || '限定活动', ...(imageUrl ? { imageUrl: new URL(imageUrl, source.origin || 'https://shibuya.parco.jp').href } : {}) });
  });
  return events;
}
