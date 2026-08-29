import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * ハンドメイドマルシェ — exhibitor directory for a craft-fair series.
 *
 * This validates a broader idea than "scrape antique markets": niche shops and
 * independent creators generally rely on fairs/expos for customer acquisition,
 * so a fair's own exhibitor directory is a discovery seed for exactly the kind
 * of small, odd, one-person operations this project exists to surface — far
 * more efficient than hunting for a dedicated directory site per craft.
 *
 * robots.txt is explicit and unusual: it names ClaudeBot (and GPTBot, etc.) as
 * intentionally welcome — "AEO方針...個別にブロックしないこと" — the opposite
 * stance from fmfm.jp, which explicitly blocks the same crawlers. Verified 2026-08-28.
 *
 * One operator runs the whole series, one site per city on its own subdomain,
 * all sharing this markup — so one parser covers every edition. Which cities to
 * actually collect is a scope decision for the caller, not this module's.
 *
 * ## One fair, one candidate
 *
 * The 708 exhibitors are **not** 708 candidates. They are all at one venue on
 * one weekend, so for "where should we go" they are a single answer — the same
 * granularity rule 方案 §4.3 states, and the same mistake 中野ブロードウェイ made
 * first. Unlike the mineral dealers, these creators publish no address of their
 * own: they exist as destinations only for those two days, at that hall.
 *
 * The roster is still what the card is made of — 「出展者708組。アクセサリー383・
 * インテリア171…」 is precisely what tells someone whether the fair is worth the
 * trip — and every creator name goes into the classifier's text, so a search
 * still reaches the fair through them.
 *
 * Structurally this is NOT a daily source: the exhibitor directory only exists
 * for the weeks around each fair, and one run costs (list pages) + (exhibitor
 * count) requests — around 760 for a full Tokyo edition. See
 * scripts/collect-handmade-marche.mjs, deliberately NOT wired into
 * scripts/sources/index.mjs.
 *
 * ## The genre trap (fixed 2026-08-28, was a real 93% data loss)
 *
 * `/creators/list_creators/?genre=N` looks like a per-genre listing and returns
 * a plausible ~49 rows, so the first implementation walked the genre list and
 * unioned the results. **The `genre` parameter is silently ignored unless the
 * form's `s` marker is also present**: every genre returned the identical 49
 * rows, and the union of all of them was those same 49 — against a real 722
 * exhibitors. Same shape as the CoRich `category_id` trap in docs/来源清单.md:
 * a filter parameter that is accepted, changes nothing, and returns enough rows
 * to look like it worked.
 *
 * With `?s=` present the search actually runs and paginates 20 at a time, so
 * discovery now walks `?s=&page=N` with no genre filter at all — fewer requests
 * than the broken genre loop, and it gets everything. A page past the end
 * returns zero ids, which is the termination signal.
 */
export const HANDMADE_MARCHE_ORIGIN = 'https://tokyo.handmade-marche.jp';

/**
 * The series' city sites. `handmade-marche.jp` itself is the Yokohama edition;
 * every other city is a subdomain. Sizes are the operator's own published
 * booth counts (handmade-marche.jp/list/), for judging what a run will cost.
 */
export const HANDMADE_MARCHE_SITES = [
  { key: 'tokyo', origin: 'https://tokyo.handmade-marche.jp', venue: '東京ドームシティ プリズムホール', booths: 700 },
  { key: 'yokohama', origin: 'https://handmade-marche.jp', venue: 'パシフィコ横浜', booths: 2500 },
  { key: 'kokura', origin: 'https://kkr.handmade-marche.jp', venue: '北九州メッセ', booths: 1100 },
  { key: 'kanazawa', origin: 'https://knz.handmade-marche.jp', venue: '石川県産業展示館', booths: 1100 },
  { key: 'shizuoka', origin: 'https://szo.handmade-marche.jp', venue: 'ツインメッセ静岡', booths: 1000 },
  { key: 'hamamatsu', origin: 'https://hma.handmade-marche.jp', venue: 'アクトシティ浜松', booths: 800 },
  { key: 'nagoya', origin: 'https://ngy.handmade-marche.jp', venue: '吹上ホール', booths: 1100 },
  { key: 'sapporo', origin: 'https://spr.handmade-marche.jp', venue: 'つどーむ', booths: 1200 },
  { key: 'hakata', origin: 'https://hkt.handmade-marche.jp', venue: '福岡国際センター', booths: 800 },
  { key: 'kobe', origin: 'https://kobe.handmade-marche.jp', venue: '神戸国際展示場', booths: 800 },
];

/** Rows per list page, fixed by the site. */
export const PAGE_SIZE = 20;

const listUrl = (origin, page) => `${origin}/creators/list_creators/?s=&page=${page}`;
const creatorUrl = (origin, exhibitorId) => `${origin}/creators/?exhibitor_id=${exhibitorId}`;

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** Extract the unique exhibitor ids on one list page. */
export function parseExhibitorIds(html) {
  const $ = cheerio.load(html);
  const ids = new Set();
  $('a[href*="exhibitor_id="]').each((_, node) => {
    const match = $(node).attr('href')?.match(/exhibitor_id=([a-f0-9-]+)/);
    if (match) ids.add(match[1]);
  });
  return [...ids];
}

/**
 * The list page's own total ("全 722 件"). Used to check that a walk collected
 * everything the site says exists, rather than trusting the loop.
 */
export function parseTotalCount(html) {
  const match = cheerio.load(html).root().text().match(/全\s*([\d,]+)\s*件/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

/**
 * `9/6(日)` has no year; the fair's own edition year is supplied by the caller
 * (`source.year`) since the same markup is reused across editions.
 */
export function parseAttendanceDate(value = '', year) {
  const match = compact(value).match(/(\d{1,2})\/(\d{1,2})/);
  return match && year ? `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : null;
}

/**
 * Parse one creator's profile page.
 * @param {string} html
 * @param {string} exhibitorId
 * @param {{name: string, year: number, venue: string, origin?: string}} source
 */
export function parseCreatorPage(html, exhibitorId, source) {
  const $ = cheerio.load(html);
  const field = (label) => compact($(`th:contains("${label}")`).first().next('td').text());

  const title = field('クリエイター名');
  const genres = [...$('.genreList .tag a')].map((node) => compact($(node).text())).filter(Boolean);
  const booth = compact($('.numberTxtEmphasis').first().text());
  const attendanceDate = parseAttendanceDate($('#boothLine .date li').first().text(), source.year);
  if (!title || !attendanceDate) return null;

  const sns = $('td.sns a[href^="http"]').first().attr('href');
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: creatorUrl(source.origin || HANDMADE_MARCHE_ORIGIN, exhibitorId),
    title,
    startDate: attendanceDate,
    place: booth ? `${source.venue} · ブース${booth}` : source.venue,
    time: attendanceDate,
    price: '详见活动页',
    text: `${title} ${genres.join(' ')} 手作り マルシェ`,
  });
  return candidate && {
    ...candidate,
    category: genres.join('・') || undefined,
    ...(sns ? { description: sns } : {}),
  };
}

/**
 * Walk the full exhibitor list, page by page, until a page yields nothing.
 *
 * Deliberately does not filter by genre — see "The genre trap" above.
 *
 * @returns {Promise<{ids: string[], total: number|null}>} `total` is the site's
 *   own count, for the caller to compare against `ids.length`.
 */
export async function discoverExhibitorIds(fetchImpl = fetch, { origin = HANDMADE_MARCHE_ORIGIN, maxPages = 500 } = {}) {
  const ids = new Set();
  let total = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchImpl(listUrl(origin, page));
    if (!response.ok) break;
    const html = await response.text();
    total ??= parseTotalCount(html);
    const pageIds = parseExhibitorIds(html);
    if (!pageIds.length) break;
    for (const id of pageIds) ids.add(id);
  }
  return { ids: [...ids], total };
}

/** One id → one candidate (or null if the page is missing required fields). */
export async function fetchCreator(exhibitorId, source, fetchImpl = fetch) {
  const response = await fetchImpl(creatorUrl(source.origin || HANDMADE_MARCHE_ORIGIN, exhibitorId));
  if (!response.ok) return null;
  return parseCreatorPage(await response.text(), exhibitorId, source);
}

/** Count values, most frequent first. */
const ranked = (values) => [...values.reduce((counts, value) => {
  if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}, new Map())].sort((a, b) => b[1] - a[1]);

/**
 * All creators → **one** candidate for the fair itself.
 *
 * Dates span the creators' own attendance days, so a two-day fair reads as two
 * days rather than as whichever day happened to be parsed first.
 *
 * @param {Array} creators  candidates from `parseCreatorPage`
 * @param {{name: string, venue: string}} source
 */
export function mapFair(creators = [], source) {
  if (!creators.length || !source?.name) return null;
  const days = [...new Set(creators.map((creator) => creator.startDate).filter(Boolean))].sort();
  if (!days.length) return null;

  // Creators carry a joined category string (「アクセサリー・陶芸」); the head of
  // each is the one the fair itself files them under.
  const genres = ranked(creators.map((creator) => String(creator.category ?? '').split('・')[0]));
  const breakdown = genres.slice(0, 5).map(([genre, count]) => `${genre}${count}`).join('・');

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: `${source.origin || HANDMADE_MARCHE_ORIGIN}/creators/list_creators/`,
    title: source.name,
    startDate: days[0],
    endDate: days.length > 1 ? days[days.length - 1] : undefined,
    place: source.venue,
    time: '详见活动页',
    price: '详见活动页',
    // Creator names ride along so a search for one still finds the fair.
    text: `${source.name} 手作り マルシェ ${genres.map(([genre]) => genre).join(' ')} ${creators.map((creator) => creator.title).join(' ')}`,
  });
  return candidate && {
    ...candidate,
    category: genres[0]?.[0] ?? '手作り',
    description: `出展者${creators.length}組。${breakdown}。`,
    attribution: `${source.name} 出展者一覧`,
    why: '個人の作り手が数百組集まる二日間。一度行けばまとめて見られるので、行き先としてはこの会場ひとつ。',
  };
}
