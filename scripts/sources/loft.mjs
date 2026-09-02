import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * Loft Project (loft-prj.co.jp) — the talk-live houses that are Tokyo's
 * physical hub for late-night / oddball / subculture events (管道设计 第六轮,
 * 2026-08-31): a Lovecraft birthday party, a sea-fishing talk, a "modified
 * human festival vol.40". Every venue shares one WordPress schedule theme
 * under `/schedule/{venue}/schedule`, so this is one parser, N registrations.
 *
 * Only the Tokyo *talk* venues are registered. Naked Loft is in Yokohama and
 * LOFT PLUS ONE WEST in Osaka; 新宿LOFT / SHELTER / Flowers Loft / heaven are
 * live-music houses whose nightly band bills would swamp the family the way
 * 舞台劇 once did — they can be added later behind the same parser if wanted.
 *
 * robots.txt returns the homepage HTML with status 200 (verified 2026-09-02),
 * i.e. no robots rules exist; the pipeline's parser sees no Disallow. The
 * site has no terms page restricting reuse of listing data; summary + link.
 *
 * Listing shape: one `.column` per show; `<time>` split into year/month/day;
 * `.c_title` title; `.open` "OPEN 19:00 - START 19:30"; `.artist_tag li`
 * performers; `.icon .steam` marks streaming availability; `p.soldout` is
 * appended when reservations closed. Month paging via
 * `?scheduleyear=YYYY&schedulemonth=M` (no zero-padding, as the site's own
 * links do it). No price on the listing.
 */
export const LOFT_ORIGIN = 'https://www.loft-prj.co.jp';

export const LOFT_VENUES = [
  { key: 'plusone', name: '新宿ロフトプラスワン', place: '新宿ロフトプラスワン（新宿区歌舞伎町）' },
  { key: 'lofta', name: '阿佐ヶ谷ロフトA', place: '阿佐ヶ谷ロフトA（杉並区阿佐谷南）' },
  { key: 'loft9', name: 'LOFT9 Shibuya', place: 'LOFT9 Shibuya（渋谷区円山町）' },
  { key: 'rockcafe', name: 'Rock Cafe Loft', place: 'Rock Cafe Loft is your room（新宿区歌舞伎町）' },
];

/** This month and the next: talk events are announced weeks, not months, ahead. */
export function loftUrls(venueKey, now = new Date(), months = 2) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: months }, (_, index) => {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    return `${LOFT_ORIGIN}/schedule/${venueKey}/schedule?scheduleyear=${month.getUTCFullYear()}&schedulemonth=${month.getUTCMonth() + 1}`;
  });
}

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').trim();

/** "OPEN 19:00 - START 19:30" → "OPEN 19:00 / START 19:30"; anything else passes through compacted. */
export function parseOpenStart(value = '') {
  const text = compact(value);
  const open = /OPEN\s*(\d{1,2}:\d{2})/i.exec(text)?.[1];
  const start = /START\s*(\d{1,2}:\d{2})/i.exec(text)?.[1];
  if (open && start) return `OPEN ${open} / START ${start}`;
  if (start) return `START ${start}`;
  if (open) return `OPEN ${open}`;
  return text || null;
}

export function parseLoft(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('div.column').each((index, node) => {
    const item = $(node);
    const link = item.find('a[href]').first();
    const href = link.attr('href');
    const title = compact(item.find('.c_title').first().text());
    const year = compact(item.find('time .year').text());
    const month = compact(item.find('time .month').text());
    const day = compact(item.find('time .day').text());
    if (!href || !title || !/^\d{4}$/.test(year) || !month || !day) return;
    const startDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const performers = item.find('.artist_tag li').toArray().map((li) => compact($(li).text())).filter((t) => t && t !== '...');
    const streaming = item.find('.icon .steam').length > 0 && !/なし/.test(compact(item.find('.icon .steam').text()));
    const soldOut = item.find('p.soldout').length > 0;
    const description = [
      performers.length ? `出演：${performers.join('、')}` : null,
      streaming ? '配信あり' : null,
      soldOut ? '予約締切（当日券は会場へ）' : null,
    ].filter(Boolean).join('｜');

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, LOFT_ORIGIN).href,
      title,
      startDate,
      place: source.venue?.place ?? source.name,
      time: parseOpenStart(item.find('.open').text()) ?? '详见活动页',
      price: '详见活动页',
      text: `${title} トークライブ ${performers.join(' ')}`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({ ...candidate, category: 'トークライブ', ...(description ? { description } : {}) });
  });
  return events;
}
