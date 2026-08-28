import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 東京ハンドメイドマルシェ — exhibitor directory for a twice-yearly craft fair.
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
 * Structurally this is NOT a daily-source: the exhibitor directory only exists
 * for the ~1 week around each fair (spring/autumn), and one run costs roughly
 * (genre count) + (creator count) requests — around 700 for a full autumn
 * edition. That is proportionate for an occasional, near-date run, not for the
 * daily cron every other source here rides on. See scripts/collect-handmade-marche.mjs,
 * which is deliberately NOT wired into scripts/sources/index.mjs.
 */
export const HANDMADE_MARCHE_ORIGIN = 'https://tokyo.handmade-marche.jp';
const LIST_URL = `${HANDMADE_MARCHE_ORIGIN}/creators/list_creators/`;
const CREATOR_URL = `${HANDMADE_MARCHE_ORIGIN}/creators/`;

/**
 * The site's own genre taxonomy — there is no "all genres" query, only
 * per-genre lists. The real `<select name="genre">` also carries 90
 * (公式ブース) and 91 (PRブース): those are the organiser's own booths, not
 * independent creators, so they are deliberately left out here. 92
 * (キルト出店エリア) is a real creator genre and is included.
 */
export const HANDMADE_MARCHE_GENRES = [
  { id: '1', label: 'アクセサリー' },
  { id: '2', label: 'ファッション' },
  { id: '3', label: 'インテリア・雑貨' },
  { id: '4', label: '陶芸・食器' },
  { id: '5', label: 'アート・写真' },
  { id: '6', label: 'ステーショナリー' },
  { id: '7', label: 'キッズ・ベビー' },
  { id: '8', label: 'ペット' },
  { id: '92', label: 'キルト出店エリア' },
  { id: '98', label: 'フード' },
  { id: '99', label: 'その他' },
];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** Extract the unique exhibitor ids listed for one genre's page. */
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
 * `9/6(日)` has no year; the fair's own edition year is supplied by the caller
 * (`source.year`) since the same markup is reused across spring/autumn editions.
 */
export function parseAttendanceDate(value = '', year) {
  const match = compact(value).match(/(\d{1,2})\/(\d{1,2})/);
  return match && year ? `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : null;
}

/**
 * Parse one creator's profile page.
 * @param {string} html
 * @param {string} exhibitorId
 * @param {{name: string, year: number, venue: string}} source
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
    sourceUrl: `${CREATOR_URL}?exhibitor_id=${exhibitorId}`,
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
 * Discover every exhibitor id across the fixed genre list, deduped — a creator
 * can appear under more than one genre tag.
 */
export async function discoverExhibitorIds(fetchImpl = fetch) {
  const ids = new Set();
  for (const genre of HANDMADE_MARCHE_GENRES) {
    const response = await fetchImpl(`${LIST_URL}?genre=${genre.id}`);
    if (!response.ok) continue;
    for (const id of parseExhibitorIds(await response.text())) ids.add(id);
  }
  return [...ids];
}

/** One id → one candidate (or null if the page is missing required fields). */
export async function fetchCreator(exhibitorId, source, fetchImpl = fetch) {
  const response = await fetchImpl(`${CREATOR_URL}?exhibitor_id=${exhibitorId}`);
  if (!response.ok) return null;
  return parseCreatorPage(await response.text(), exhibitorId, source);
}
