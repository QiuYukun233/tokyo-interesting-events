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
