import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 東京都歴史文化財団 — one operator, many museums.
 *
 * The foundation runs 東京都美術館, 東京都現代美術館, 東京都写真美術館,
 * 東京都庭園美術館, 江戸東京たてもの園, 東京芸術劇場 and 東京文化会館. Adding
 * the operator reaches all of them at once, which is why this is preferred over
 * writing an adapter per venue — and why it is the lawful answer to wanting the
 * art listings that Tokyo Art Beat aggregates but does not license.
 *
 * Access is the site's own WordPress REST API. The `benefits` post type is the
 * cross-venue exhibition list and carries structured custom fields; note that
 * `hands_on_events` (597 posts, the workshops and theatre tours we still lack)
 * returns empty bodies over REST and would need a per-item fetch, so it is not
 * covered here.
 *
 * Links point at each museum's own exhibition page, not at the foundation.
 */
export const REKIBUN_BENEFITS_URL = 'https://www.rekibun.or.jp/wp-json/wp/v2/benefits?per_page=100';

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();
const stripTags = (value = '') => compact(String(value).replace(/<[^>]*>/g, ' '));

/**
 * Decode the HTML entities WordPress puts in rendered titles.
 * Only the five that actually appear; a full decoder is not worth the surface.
 */
const decodeEntities = (value = '') => value
  .replace(/&#0?38;|&amp;/g, '&').replace(/&#0?60;|&lt;/g, '<').replace(/&#0?62;|&gt;/g, '>')
  .replace(/&#0?34;|&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ');

/**
 * Parse the foundation's exhibition period.
 *
 * The field is hand-typed and inconsistent: `2026/6/18(木)  − 2026/9/21(月・祝)`,
 * `2026/7/23 (木) − 2026/10/7 (水)`, `2026/8/29（土）− 2026/12/6（日）`,
 * `2026/07/4 (土) − 2026/09/13 (日)`. Half- and full-width brackets both occur,
 * the separator is U+2212 MINUS SIGN rather than a hyphen, and months and days
 * are sometimes zero-padded. Pulling the dates out positionally sidesteps all
 * of it: the first date is the start, the second the end.
 *
 * @returns {{startDate: string|null, endDate: string|null}}
 */
export function parseExhibitionPeriod(value = '') {
  const dates = [...String(value).matchAll(/(20\d{2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/g)]
    .map(([, year, month, day]) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return { startDate: dates[0] ?? null, endDate: dates[1] ?? null };
}

/** `discount` means the foundation's members get a discount — everyone pays something. */
export function priceFor(acf = {}) {
  const regular = acf.regular_price || {};
  const adult = compact(regular.faculty_price);
  if (adult) return `一般 ￥${adult}`;
  if (acf.exhibition_type === 'free') return '详见活动页';
  return '详见活动页';
}

/** Map one WordPress post to an event candidate. Returns null when unusable. */
export function mapRekibunPost(post, source, visualIndex = 0) {
  const acf = post?.acf || {};
  const title = decodeEntities(stripTags(post?.title?.rendered));
  const { startDate, endDate } = parseExhibitionPeriod(acf.benefits_date);
  if (!title || !startDate) return null;

  const venue = compact(acf.benefits_location);
  const candidate = createEventCandidate({
    sourceName: source?.name || '東京都歴史文化財団',
    // The museum's own page is the useful destination; the foundation's post is a stub.
    sourceUrl: compact(acf.url_link) || post.link,
    title,
    startDate,
    endDate: endDate || undefined,
    place: venue || '东京都内 · 都立文化设施',
    time: compact(acf.benefits_date) || '详见活动页',
    price: priceFor(acf),
    text: `${title} 展覧会 美術`,
    visualIndex,
  });
  return candidate && { ...candidate, ...(venue ? { attribution: venue } : {}) };
}

export const mapRecord = (post, source, index = 0) => mapRekibunPost(post, source, index);

/* ------------------------------------------------------------------------- */

/**
 * アート・カルチャー体験100 — the foundation's hands-on programme listing.
 *
 * This is the 参与式消遣 family the plan had at zero: workshops, theatre and
 * backstage tours, gallery talks, children's programmes, technology sessions.
 *
 * The REST API is a dead end here — `hands_on_events` posts return empty
 * content, excerpt and ACF, and their detail pages are stubs ending right after
 * the title. The listing page, however, ships the whole record in its initial
 * HTML: venue, date, title, genre and a link straight to the venue's own page.
 * So this costs a dozen page fetches, not 597 detail fetches.
 *
 * Items are ordered by date from today onward, ten per page. Pages past the end
 * return 200 with an empty list rather than 404, so a fixed page list is safe.
 */
const HANDS_ON_BASE = 'https://www.rekibun.or.jp/hands_on_events/';
const HANDS_ON_PAGES = 12;

export const REKIBUN_HANDS_ON_URLS = [
  HANDS_ON_BASE,
  ...Array.from({ length: HANDS_ON_PAGES - 1 }, (_, index) => `${HANDS_ON_BASE}page/${index + 2}/`),
];

/**
 * Parse a listing page.
 *
 * Dates read `2026/08/25 – 2026/09/13` or a single `2026/08/28`. The separator
 * is an en dash here and a minus sign in the exhibition feed, so dates are
 * again taken positionally rather than by splitting.
 */
export function parseRekibunHandsOn(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();
  $('ul.list1 > li > a').each((_, node) => {
    const link = $(node);
    const sourceUrl = link.attr('href');
    const title = compact(link.find('span.txt').text());
    const period = compact(link.find('span.date').text());
    const dates = [...period.matchAll(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/g)]
      .map(([, year, month, day]) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!sourceUrl || !title || !dates.length) return;

    const key = `${sourceUrl}:${title}`;
    if (seen.has(key)) return;
    seen.add(key);

    const venue = compact(link.find('span.place').text());
    // The genre class carries the taxonomy id (genre107, genre113 ...); the
    // label is the text, and only the label is worth keeping.
    const genre = compact(link.find('span[class^="genre"]').first().text());
    const candidate = createEventCandidate({
      sourceName: source?.name || '東京都歴史文化財団',
      sourceUrl,
      title,
      startDate: dates[0],
      endDate: dates[1] || undefined,
      place: venue || '东京都内 · 都立文化设施',
      time: period || '详见活动页',
      price: '详见活动页',
      text: `${title} ${genre}`,
      visualIndex: events.length,
    });
    if (candidate) events.push({ ...candidate, ...(venue ? { attribution: venue } : {}), ...(genre ? { category: genre } : {}) });
  });
  return events;
}
