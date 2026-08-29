import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * よしもと漫才劇場ネットワーク — comedy/manzai schedules, 4 Tokyo venues.
 *
 * The venue pages (`{venue}.yoshimoto.co.jp/event/`) render their calendar
 * client-side; the underlying call is `feed-api.yoshimoto.co.jp/fany/theater/v1`,
 * found by reading the page's own `event.js`. It is unauthenticated and used
 * unmodified by their own front end, but it is an internal data feed, not a
 * page meant to be browsed — `feed-api.yoshimoto.co.jp/robots.txt` itself
 * 403s with an API-gateway "missing authentication token" error, meaning the
 * host has no crawling policy at all because it was never meant to serve
 * pages. Used with explicit approval (2026-08-28) and on the same low-frequency
 * cadence as every other source here: one request per venue, once a day, over
 * a ±60 day window — nothing beyond what the venue's own page already asks
 * for on a single visit.
 *
 * `theater`/`venue` pairs come from the hidden form fields on each venue's own
 * `/event/` page.
 */
export const YOSHIMOTO_FEED_URL = 'https://feed-api.yoshimoto.co.jp/fany/theater/v1';

export const YOSHIMOTO_VENUES = [
  { name: 'YOSHIMOTO ROPPONGI THEATER', theater: 'roppongi', place: '六本木' },
  { name: '渋谷よしもと漫才劇場', theater: 'shibuya_manzaigekijyo', place: '渋谷' },
  { name: '神保町よしもと漫才劇場', theater: 'jimbocho_manzaigekijyo', place: '神保町' },
  { name: 'ルミネtheよしもと', theater: 'lumine', place: '新宿' },
];

const HORIZON_DAYS = 60;

const ymd = (date) => `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;

/** Build the feed URL for one venue; `now` is injected so this stays pure. */
export function yoshimotoUrl(theater, now = new Date()) {
  const to = new Date(now.getTime() + HORIZON_DAYS * 86400000);
  const params = new URLSearchParams({ theater, venue: '01', date_from: ymd(now), date_to: ymd(to) });
  return `${YOSHIMOTO_FEED_URL}?${params}`;
}

const compact = (value = '') => String(value ?? '').replace(/\s+/g, ' ').trim();

/** `YYYY/MM/DD` → `YYYY-MM-DD`. */
function isoDate(value = '') {
  const match = String(value).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

/** Prefer the venue's official ticket link over the resale marketplace. */
const ticketUrl = (row) => row.url2 || row.url1 || null;

/**
 * Map one feed row to an event candidate. Member names go in `description` —
 * that is the actual "why go" for a manzai lineup, closer to an editorial hook
 * than a structured field.
 */
export function mapYoshimotoRow(row, source, index = 0) {
  const title = compact(row?.name);
  const startDate = isoDate(row?.date);
  const url = ticketUrl(row) || source.origin;
  if (!title || !startDate || !url) return null;

  const time = [row.dateTime1, row.dateTime2].filter(Boolean).join('〜') || '详见活动页';
  const price = [row.price1, row.price2].filter(Boolean).map((value) => value.replace('\\', '￥')).join(' / ') || '详见活动页';

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: url,
    title,
    startDate,
    place: source.place ? `${source.name} · ${source.place}` : source.name,
    time,
    price,
    text: `${title} お笑い 漫才`,
    visualIndex: index,
  });
  const member = compact(row?.member);
  return candidate && { ...candidate, category: 'お笑い・漫才', ...(member ? { description: member.slice(0, 300) } : {}) };
}

/** Adapter entry point: the pipeline hands over the already-parsed JSON array. */
export const mapRecord = (row, source, index = 0) => mapYoshimotoRow(row, source, index);

/**
 * Fold one theatre's whole run into a single candidate.
 *
 * A comedy theatre puts on three or four bills a day, so 60 days of feed is
 * ~220 rows per venue and 832 across the four. Judged as candidates they are
 * unanswerable: nobody decides 220 times whether ルミネtheよしもと is worth
 * going to. **The theatre is the destination; the bills are its schedule** —
 * the same shape as 中野ブロードウェイ's tenants, on the time axis rather than
 * the floor plan (方案 §4.3).
 *
 * What the card needs is therefore the shape of the run, not one night of it:
 * how many performances, over how many days, and who is on. Individual bills
 * are deliberately not pooled — "what is on tonight" is a schedule lookup, and
 * a candidate that expires tomorrow is the wrong unit for a standing theatre.
 *
 * `ongoing: true` because a theatre has no end date; `changeType: 'discovery'`
 * makes lib/object-type.mjs read it as a `place`.
 */
export function aggregateTheatre(events = [], source = {}) {
  if (!events.length) return [];
  const days = [...new Set(events.map((event) => event.startDate).filter(Boolean))].sort();
  const performers = [...new Set(events
    .flatMap((event) => String(event.description ?? '')
      // The feed writes bills as 「[企画ライブ]名前」 and 「A／ゲスト：B」; strip
      // the labels or the card lists 「[企画ライブ]ケビンス」 as a performer.
      .replace(/\[[^\]]*\]/g, '')
      .replace(/(ゲスト|出演)[:：]/g, '')
      .split(/[、,／/]/))
    .map((name) => name.trim())
    .filter((name) => name && name.length <= 12 && !/^(ほか|他)$/.test(name)))];

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: source.venueUrl ?? YOSHIMOTO_FEED_URL,
    title: source.name,
    startDate: days[0],
    place: source.place ? `${source.place} · ${source.name}` : source.name,
    time: '公演スケジュールは公式サイト',
    price: '详见活动页',
    text: `${source.name} お笑い 漫才 コント 寄席 ${performers.slice(0, 40).join(' ')}`,
  });
  if (!candidate) return [];
  return [{
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    category: 'お笑い・演芸',
    description: `${days.length}日間で${events.length}公演。出演：${performers.slice(0, 12).join('、')}ほか。`,
    attribution: source.name,
    why: '毎日いくつも公演が入れ替わる常設の劇場。行くと決めてから日程を選べばいい。',
  }];
}
