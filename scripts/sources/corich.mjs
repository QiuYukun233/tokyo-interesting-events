import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * CoRich 舞台芸術！ — nationwide theatre/musical listings, filtered to Tokyo.
 *
 * Deliberately unfiltered by genre. `category_id`/`pref_id` do nothing on a
 * plain GET (verified: every category_id returned the identical unfiltered
 * count), so the only working lever is client-side: keep rows whose venue
 * carries `（東京都）`. That means 歌舞伎・伝統芸能, 2.5次元舞台, 朗読劇,
 * 舞踊・バレエ all arrive mixed in with mainstream 演劇/ミュージカル — which is
 * the point. This site is explicitly meant to surface odd, small-scale,
 * long-tail entertainment, not just what a search would already find; no
 * popularity or genre gate belongs here. Judge each show on its own merits in
 * the back office, not by pre-filtering the shape of "normal theatre".
 *
 * robots.txt lists only sitemaps, no Disallow at all. The terms of use are
 * silent on scraping/republishing production listing data (verified
 * 2026-08-28) — unlike Tokyo Art Beat, this one is not blocked.
 */
export const CORICH_BASE = 'https://stage.corich.jp/stage';

/**
 * `type=now` (currently running) tops out at 6 pages; `type=start` (upcoming,
 * sorted soonest-first via `sort=start`) tops out at 30 — page 31 is
 * confirmed empty. Both are hardcoded lists, not open-ended: a page past the
 * real end returns 200 with zero items, so a fixed URL list is safe the same
 * way it is for 体験100.
 */
export const CORICH_URLS = [
  ...Array.from({ length: 6 }, (_, index) => `${CORICH_BASE}?type=now&page=${index + 1}`),
  ...Array.from({ length: 30 }, (_, index) => `${CORICH_BASE}?type=start&sort=start&page=${index + 1}`),
];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** `2026/08/28 (金) ～ 2026/08/30 (日)` or a single date with no range. */
export function parsePeriod(value = '') {
  const dates = [...compact(value).matchAll(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/g)]
    .map(([, year, month, day]) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return { startDate: dates[0] ?? null, endDate: dates[1] && dates[1] !== dates[0] ? dates[1] : null };
}

/** Parse one listing page. `source.originArea` restricts to a single prefecture. */
export function parseCorich(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  const wanted = source?.prefecture ?? '東京都';
  $('a.list-group-item.box').each((index, node) => {
    const item = $(node);
    const pref = compact(item.find('.theater .pref').text()).replace(/[（）]/g, '');
    if (pref !== wanted) return;

    const title = compact(item.find('p.stage').first().text());
    const href = item.attr('href');
    const { startDate, endDate } = parsePeriod(item.find('p.period').text());
    if (!title || !href || !startDate) return;

    const group = compact(item.find('p.group').first().text());
    const theater = compact(item.find('.theater').clone().children('.pref').remove().end().text());
    const price = compact(item.find('p.price').text()) || '详见活动页';

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, CORICH_BASE).href,
      title,
      startDate,
      endDate: endDate || undefined,
      place: theater || '东京都内 · 详见剧场',
      time: endDate && endDate !== startDate ? '详见场次' : '详见活动页',
      price,
      text: `${title} 舞台 演劇`,
      visualIndex: index,
    });
    // Most titles ("商人", "EGG") carry no genre word at all; without a category
    // tag, lib/activity-filter.mjs's signal detection has nothing to match on.
    if (candidate) events.push({ ...candidate, category: '舞台・演劇', ...(group ? { attribution: group } : {}) });
  });
  return events;
}
