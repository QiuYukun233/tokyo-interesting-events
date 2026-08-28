import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * SCRAP リアル脱出ゲーム — three Tokyo venues, two page templates.
 *
 * SCRAP runs escape-room "games" as rotating limited runs, so a store's own
 * page is effectively its event list — no separate listing page to find.
 * 池袋店/吉祥寺店 share one WordPress template (`ul.list02`); 東京ミステリー
 * サーカス (Shinjuku) uses a different one (`article.js_eventsItem`). Both are
 * parsed here rather than as two files, since the shared date/price logic is
 * the only real complexity.
 *
 * Three more venues (原宿/浅草/渋谷) live on `realdgame.jp`, whose robots.txt
 * carries auto-generated-looking gibberish sitemap filenames — a signal odd
 * enough to leave that domain alone for now. Detail links on the pages parsed
 * here do point at realdgame.jp (SCRAP's underlying platform), but linking out
 * to a URL is not the same as crawling it, so that is fine.
 *
 * No terms-of-use page was found restricting reuse of the schedule data.
 *
 * Several games run open-ended with no announced end date — the page just says
 * "開催：2024年12月29日〜". That used to be indistinguishable from a single-day
 * event, because both parsed to "no end date" and `lib/pool-db.mjs`'s horizon
 * filter read a missing endDate as single-day. Twenty-four still-bookable games
 * had silently aged out of `/backstage` and `npm run review` by 2026-08-28.
 *
 * The pool now has an explicit `ongoing` flag and `parsePeriod` reports it: a
 * trailing 〜 with nothing after it means "until further notice", no 〜 at all
 * means one day. The distinction is the source's own wording, not a guess.
 */
export const SCRAP_SOURCES = [
  { name: 'リアル脱出ゲーム池袋店', family: 'shop', url: 'https://www.scrapmagazine.com/ikebukuro/', origin: 'https://www.scrapmagazine.com' },
  { name: 'リアル脱出ゲーム吉祥寺店', family: 'shop', url: 'https://www.scrapmagazine.com/nazobldg_kichijoji/', origin: 'https://www.scrapmagazine.com' },
  { name: '東京ミステリーサーカス', family: 'tmc', url: 'https://mysterycircus.jp/events/', origin: 'https://mysterycircus.jp' },
];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/**
 * `開催：2026年1月29日(木)〜` (open-ended), `開催：2026年9月3日(木)〜12月6日(日)`
 * (end date omits the year), `開催：2026.07.01〜2026.10.12` (both full, dotted).
 * All three appear across the two templates, so dates are read positionally
 * rather than by picking one separator convention.
 */
export function parsePeriod(value = '') {
  const text = compact(value).replace(/^開催[:：]\s*/, '');
  // 〜 (U+301C wave dash), ～ (U+FF5E fullwidth tilde) and ASCII ~ all appear
  // across these pages, sometimes on the same site for the same field.
  const [before, after] = text.split(/[〜～~]/);
  const full = (segment) => {
    const match = String(segment || '').match(/(\d{4})[年.](\d{1,2})[月.](\d{1,2})/);
    return match ? { year: match[1], month: match[2].padStart(2, '0'), day: match[3].padStart(2, '0') } : null;
  };
  const start = full(before);
  if (!start) return { startDate: null, endDate: null, ongoing: false };
  const startDate = `${start.year}-${start.month}-${start.day}`;
  // A trailing 〜 with nothing after it is SCRAP saying "runs until further
  // notice"; no 〜 at all is a single day. Both used to come back as "no end
  // date", which the pool read as single-day and quietly aged the long-running
  // games out of view. `ongoing` keeps the two apart.
  if (after !== undefined && !after.trim()) return { startDate, endDate: null, ongoing: true };
  if (after === undefined) return { startDate, endDate: null, ongoing: false };

  let end = full(after);
  if (!end) {
    const partial = after.match(/(\d{1,2})月(\d{1,2})日/);
    if (partial) {
      const year = Number(start.year) + (Number(partial[1]) < Number(start.month) ? 1 : 0);
      end = { year: String(year), month: partial[1].padStart(2, '0'), day: partial[2].padStart(2, '0') };
    }
  }
  const endDate = end ? `${end.year}-${end.month}-${end.day}` : null;
  // A parsed 〜 whose right side is not a date (「〜好評につき延長中」) is also
  // open-ended, not single-day.
  return { startDate, endDate: endDate === startDate ? null : endDate, ongoing: !endDate };
}

function buildTime(limit, people, duration) {
  const parts = [limit && `限时${limit}`, people && `${people}`, duration && `全程约${duration}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : '详见活动页';
}

function toCandidate(source, index, { href, title, price, period, limit, people, duration }) {
  const { startDate, endDate, ongoing } = parsePeriod(period);
  if (!href || !title || !startDate) return null;
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: new URL(href, source.origin).href,
    title,
    startDate,
    endDate: endDate || undefined,
    place: source.name,
    time: buildTime(limit, people, duration),
    price: price || '详见活动页',
    text: title,
    visualIndex: index,
  });
  return candidate && { ...candidate, category: '脱出ゲーム・謎解き', ...(ongoing ? { ongoing: true } : {}) };
}

function parseShopTemplate($, source) {
  const events = [];
  $('ul.list02 > li > a').each((index, node) => {
    const item = $(node);
    events.push(toCandidate(source, index, {
      href: item.attr('href'),
      title: compact(item.find('p.tit').text()),
      price: compact(item.find('.icon_price').text()),
      period: item.find('.icon_period').text(),
      limit: compact(item.find('.icon_watch').text()),
      people: compact(item.find('.icon_people').text()),
      duration: compact(item.find('.icon_time').text()),
    }));
  });
  return events.filter(Boolean);
}

function parseTmcTemplate($, source) {
  const events = [];
  $('article.js_eventsItem').each((index, node) => {
    const item = $(node);
    const link = item.find('a.events-item-inner').first();
    events.push(toCandidate(source, index, {
      href: link.attr('href'),
      title: compact(item.find('.event-item-title').text()) || compact(link.attr('title')),
      price: compact(item.find('.event-item-system-icon.price').text()),
      period: item.find('.event-item-system-icon.period').text(),
      limit: compact(item.find('.event-item-system-icon.limit').text()),
      people: compact(item.find('.event-item-system-icon.person').text()),
      duration: compact(item.find('.event-item-system-icon.duration').text()),
    }));
  });
  return events.filter(Boolean);
}

export function parseScrap(html, source) {
  const $ = cheerio.load(html);
  return source.family === 'tmc' ? parseTmcTemplate($, source) : parseShopTemplate($, source);
}
