import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * Maker Faire Tokyo — exhibitor directory for a twice-a-year-scale DIY/maker
 * fair, same "展会出展者目录 as shop/creator discovery" idea validated by
 * scripts/sources/handmade-marche.mjs, applied to a second event.
 *
 * robots.txt is a plain default (only /wp-admin/ disallowed); no terms-of-use
 * page restricting reuse of the exhibitor data was found. Verified 2026-08-28.
 *
 * Unlike the marché, every exhibitor attends both fixed days of the fair, so
 * there is no per-exhibitor date to parse — `source.startDate`/`endDate` cover
 * everyone. Discovery is also much cheaper: the 50-on kana index
 * (`?n=101..114`) lists every exhibitor (~290 for the 2026 edition) across 14
 * pages, one request each. The `maker__genre` SPONSOR badge marks corporate
 * booths rather than individual makers, but sponsors still carry real content
 * (their own category tags, a description, a booth) — kept in the pool like
 * everything else and left for the back office to judge, not filtered here.
 *
 * ## One fair, one candidate
 *
 * The 287 exhibitors are **not** 287 candidates: one venue, one weekend, one
 * answer to "where should we go" — 方案 §4.3. The roster becomes the card
 * instead, because 「出展者287組。エレクトロニクス44・Young Makers43・
 * ロボティクス41…」 is exactly what tells someone whether to go.
 *
 * Structurally this is the same kind of occasional/manual source as the
 * marché: see scripts/collect-maker-faire-tokyo.mjs, deliberately NOT wired
 * into scripts/sources/index.mjs's daily SOURCES.
 */
export const MAKER_FAIRE_ORIGIN = 'https://makezine.jp';
const INDEX_URL = `${MAKER_FAIRE_ORIGIN}/event/makers-mft2026/`;

/** The site's own 50-on (kana) index buckets — there is no "list everyone" query. */
export const MAKER_FAIRE_KANA_INDEXES = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** Extract each exhibitor's slug from one kana-index page. */
export function parseMakerSlugs(html) {
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('li.maker > a[href*="/event/makers-mft2026/"]').each((_, node) => {
    const match = $(node).attr('href')?.match(/\/event\/makers-mft2026\/([^/?#]+)\/?/);
    if (match) slugs.add(match[1]);
  });
  return [...slugs];
}

/**
 * Parse one exhibitor's detail page.
 * @param {string} html
 * @param {string} slug
 * @param {{name: string, startDate: string, endDate: string, venue: string}} source
 */
export function parseMakerDetail(html, slug, source) {
  const $ = cheerio.load(html);
  const title = compact($('h3.maker__name').first().text());
  if (!title) return null;

  const categories = [...$('ul.maker__category a')].map((node) => compact($(node).text())).filter(Boolean);
  const booth = compact($('.maker__booth__no').first().text());
  const tagline = compact($('.maker__title_ja').first().text());
  const description = compact($('.maker__description').first().text());
  const sns = $('.maker__sns a[href^="http"]').first().attr('href');

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: `${MAKER_FAIRE_ORIGIN}/event/makers-mft2026/${slug}/`,
    title,
    startDate: source.startDate,
    endDate: source.endDate,
    place: booth ? `${source.venue} · ブース${booth}` : source.venue,
    time: '详见活动页',
    price: '详见活动页',
    text: `${title} ${tagline} ${categories.join(' ')}`,
  });
  return candidate && {
    ...candidate,
    category: categories.join('・') || undefined,
    ...(description ? { description: tagline ? `${tagline} — ${description}` : description } : {}),
    ...(sns ? { attribution: sns } : {}),
  };
}

/** Discover every exhibitor slug across the kana index, deduped. */
export async function discoverMakerSlugs(fetchImpl = fetch) {
  const slugs = new Set();
  for (const n of MAKER_FAIRE_KANA_INDEXES) {
    const response = await fetchImpl(`${INDEX_URL}?n=${n}`);
    if (!response.ok) continue;
    for (const slug of parseMakerSlugs(await response.text())) slugs.add(slug);
  }
  return [...slugs];
}

/** One slug → one candidate (or null if the page is missing required fields). */
export async function fetchMaker(slug, source, fetchImpl = fetch) {
  const response = await fetchImpl(`${MAKER_FAIRE_ORIGIN}/event/makers-mft2026/${slug}/`);
  if (!response.ok) return null;
  return parseMakerDetail(await response.text(), slug, source);
}

/** Count values, most frequent first. */
const ranked = (values) => [...values.reduce((counts, value) => {
  if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}, new Map())].sort((a, b) => b[1] - a[1]);

/**
 * All exhibitors → **one** candidate for the fair.
 *
 * @param {Array} exhibitors  candidates from `parseMakerDetail`
 * @param {{name: string, startDate: string, endDate?: string, venue: string}} source
 */
export function mapFair(exhibitors = [], source) {
  if (!exhibitors.length || !source?.startDate) return null;
  const genres = ranked(exhibitors.flatMap((exhibitor) => String(exhibitor.category ?? '').split('・')));
  const breakdown = genres.slice(0, 5).map(([genre, count]) => `${genre}${count}`).join('・');

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: `${MAKER_FAIRE_ORIGIN}/event/mft2026/`,
    title: source.name,
    startDate: source.startDate,
    endDate: source.endDate,
    place: source.venue,
    time: '详见活动页',
    price: '详见活动页',
    text: `${source.name} ものづくり ${genres.map(([genre]) => genre).join(' ')} ${exhibitors.map((exhibitor) => exhibitor.title).join(' ')}`,
  });
  return candidate && {
    ...candidate,
    category: genres[0]?.[0] ?? 'ものづくり',
    description: `出展者${exhibitors.length}組。${breakdown}。`,
    attribution: `${source.name} 出展者一覧`,
    why: '個人の作り手と学生チームが数百組。会場ひとつで全部見て回れる二日間。',
  };
}
