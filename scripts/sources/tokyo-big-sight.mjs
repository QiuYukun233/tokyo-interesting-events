import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * Tokyo Big Sight, from the venue's own open data rather than its HTML listing.
 *
 * The HTML page yields ten events; this CSV carries the full three-month
 * schedule — 154 at the time of writing — and adds fields the page never
 * showed: admission audience, price, description and the organiser's URL.
 *
 * `来場対象者` matters most. Publication used to guess public access by
 * regex-matching an audience string scraped off the page; here it is the
 * operator's own declaration, one of 商談 / 一般 / 商談・一般.
 *
 * Shift_JIS. The pipeline's CSV reader handles that.
 */
export const TOKYO_BIG_SIGHT_URL = 'https://www.opendata.metro.tokyo.lg.jp/tokyobigsight/tokyobigsighteventinformation.csv';

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** `2026/9/2` and `2026-09-02` both appear across Tokyo's open data. */
export function isoDate(value = '') {
  const match = compact(value).match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

/**
 * Normalise the audience column so downstream code tests one vocabulary.
 * Separators vary (`商談/一般`, `商談・一般`), so match the tokens, not the whole cell.
 */
export function normalizeAudience(value = '') {
  const text = compact(value);
  const general = /一般/.test(text);
  const trade = /商談|商談会|業界/.test(text);
  if (general && trade) return '商談・一般';
  if (general) return '一般';
  if (trade) return '商談';
  return text || '不明';
}

/** Map one open-data row to an event candidate. Returns null for unusable rows. */
export function mapBigSightRow(row, source, visualIndex = 0) {
  const title = compact(row['展示会名']);
  const startDate = isoDate(row['会期(開始)']);
  if (!title || !startDate) return null;

  const audience = normalizeAudience(row['来場対象者']);
  const description = compact(row['内容']);
  const facility = compact(row['利用施設']);
  const candidate = createEventCandidate({
    sourceName: source?.name || 'Tokyo Big Sight',
    // The organiser's own site is the better link; fall back to the venue calendar.
    sourceUrl: compact(row['URL']) || 'https://www.bigsight.jp/visitor/event/',
    title,
    startDate,
    endDate: isoDate(row['会期(終了)']) || undefined,
    place: facility ? `东京Big Sight · ${facility}` : '东京Big Sight',
    time: compact(row['開催時間']) || '详见活动页',
    price: compact(row['入場料について']) || '详见活动页',
    text: `${title} ${description}`,
    visualIndex,
  });
  return candidate && { ...candidate, audience, ...(description ? { description } : {}) };
}

/** Adapter entry point: the pipeline hands over already-parsed CSV records. */
export const mapRecord = (record, source, index = 0) => mapBigSightRow(record, source, index);
