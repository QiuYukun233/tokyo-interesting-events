import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const TOKYO_PARK_EVENTS_URL = 'https://www.tokyo-park.or.jp/event_search/index.html';
export const TOKYO_PARK_ORIGIN = 'https://www.tokyo-park.or.jp';

const DISTINCTIVE = /夜間|特別(?:公開|開園|観賞)|限定(?:公開|開門)|月見|和傘|謎解き|ライトアップ|建築祭|通常非公開/;
const compact = (value = '') => String(value).normalize('NFKC').replace(/[\s\u3000]+/g, ' ').trim();
const reiwaYear = (year) => Number(year) + 2018;
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function parseJapaneseRange(value = '') {
  const text = compact(value);
  const start = text.match(/(?:(20\d{2})年|令和\s*(\d+)年)\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!start) return null;
  const year = start[1] ? Number(start[1]) : reiwaYear(start[2]);
  const startDate = iso(year, start[3], start[4]);
  const tail = text.slice((start.index ?? 0) + start[0].length);
  const end = tail.match(/[～〜~-]\s*(?:(20\d{2})年\s*)?(?:(\d{1,2})月\s*)?(\d{1,2})日/);
  if (!end) return { startDate };
  return { startDate, endDate: iso(end[1] || year, end[2] || start[3], end[3]) };
}

export function parseTokyoParkEvents(html, source = {}) {
  const $ = cheerio.load(html);
  const rows = [];
  $('li').each((index, element) => {
    const card = $(element);
    const link = card.find(':scope > div > .detail h3 a').first();
    const title = compact(link.text());
    if (!title || !DISTINCTIVE.test(title)) return;
    const dateNode = card.find(':scope > div > .detail .date').first();
    // The live site emits invalid nested <p> markup, which HTML parsers repair
    // into a sibling. Fixtures and future valid markup still use dateNode text.
    const dateText = dateNode.text() || dateNode.next('p').text();
    const range = parseJapaneseRange(dateText);
    const place = compact(card.find(':scope > div > .detail .spot-list .spot').first().text());
    if (!range || !place) return;
    const sourceUrl = new URL(link.attr('href'), source.origin || TOKYO_PARK_ORIGIN).href;
    const candidate = createEventCandidate({
      sourceName: source.name || '東京都公園協会',
      sourceUrl,
      title,
      ...range,
      place,
      time: '详见官方页面',
      price: '详见官方页面',
      text: '特别开放 夜间 限定 体验',
      visualIndex: index,
    });
    if (candidate) rows.push({
      ...candidate,
      category: '庭园特别体验',
      ...(/特別公開|通常非公開|限定公開|限定開門/.test(title) ? { changeType: 'special_access' } : {}),
      description: '夜间开放、通常非公开空间、限定仪式或主题游园等非常规体验。',
    });
  });
  return [...new Map(rows.map((row) => [row.sourceUrl, row])).values()];
}


