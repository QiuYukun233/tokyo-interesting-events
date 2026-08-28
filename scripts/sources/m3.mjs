import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * M3（音系・メディアミックス同人即売会）— the digital catalogue's own API.
 *
 * M3 is the doujin *music* market: about 1,700 circles selling their own
 * recordings at 東京流通センター twice a year. Its genre list is the reason it
 * is here — レトロゲーム音楽, 音ゲー, 東方project, VOCALOID, ドラマ・トーク,
 * 実験映像 are separate declared categories, not tags someone guessed. This is
 * the long tail plan §3.2 asks for, and none of it surfaces in a venue calendar.
 *
 * The catalogue front-end is a Next.js SPA, but it reads a public unauthenticated
 * REST API which is far better than scraping the rendered page:
 *   GET /exhibitions          every edition, `isActive` marks the current one
 *   GET /exhibitions/{id}     that edition's `eventDate`
 *   GET /circles/{id}         **all ~1,700 circles in one response**
 *   GET /companies/{id}       corporate exhibitors (not collected; the point
 *                             here is the individual circles)
 *
 * Two fields make these candidates unusually self-explanatory, and both are
 * written by the circle itself rather than inferred: `prText` (its own pitch)
 * and `keywords` (its own tags). Between them a card needs no invented blurb.
 *
 * ## Why this is a standalone collector and not a daily source
 *
 * A run costs three requests, so cost is not the reason. The reason is that the
 * edition id cannot be computed — it has to be looked up from `/exhibitions` —
 * and the registry's daily sources take a fixed URL list built at module load.
 * Hardcoding `/circles/2026s` would keep returning a stale, past edition's 1,700
 * rows after the fair moved on: a full-looking response, no failure, no
 * `empty_parse` alert, and nothing new. That is the silent-staleness failure
 * docs/信息获取管道设计.md warns about for seasonal sources, so the edition is
 * resolved at run time here instead.
 *
 * robots.txt: none on any of the three hosts (404), so no restriction. The
 * catalogue is published for attendees to browse. Verified 2026-08-28.
 */
export const M3_API = 'https://api.catalog.m3net.jp';
export const M3_CATALOG = 'https://catalog.m3net.jp';

/** M3 always runs at 東京流通センター (大田区平和島); the API does not say so. */
export const M3_VENUE = '東京流通センター（大田区平和島）';

/**
 * The catalogue's own genre codes, read from the `<select>` its circle list
 * renders server-side — the API returns only the bare code and publishes no
 * lookup endpoint. An unknown code is passed through rather than dropped, so a
 * new category shows up as itself instead of vanishing.
 */
export const M3_GENRES = {
  A00: '音楽一般：クラシック・環境音楽・民族音楽・ジャズ・フュージョン',
  A01: '音楽一般：ポップス',
  A02: '音楽一般：ロック',
  A03: '音楽一般：テクノ・クラブ',
  A10: 'アニメ/ゲーム系：アニメソング',
  A11: 'アニメ/ゲーム系：レトロゲーム',
  A12: 'アニメ/ゲーム系：コンシューマ機・アーケード',
  A13: 'アニメ/ゲーム系：PCゲーム・ネットゲーム',
  A14: 'アニメ/ゲーム系：東方project',
  A15: 'アニメ/ゲーム系：VOCALOID',
  A16: 'アニメ/ゲーム系：音ゲー',
  A20: '音響作品：ドラマ・トーク（放送劇・声優など）',
  A29: '音響作品：その他（クロスオーバー・コラージュ・効果音など）',
  V00: '映像：アニメ（セル・CGなど）',
  V01: '映像：実写（特撮・ドラマなど）',
  V02: '映像：静止画（2D・3Dデータなど）',
  V99: '映像：その他（実験映像など）',
  M00: 'マルチメディア：ソフトウエア・ゲームソフト',
  M01: 'マルチメディア：ハードウエア・楽譜・書籍',
  M02: 'マルチメディア：YouTuber/VTuber',
  M99: 'マルチメディア：その他ノンジャンル',
};

export const genreLabel = (code) => M3_GENRES[code] || code || undefined;

/** `2026-04-24T15:00:00.000Z` is midnight JST on the fair day. */
export function eventDateToJst(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

/** Pick the edition marked active, else the most recently updated one. */
export function activeExhibition(payload) {
  const items = payload?.items ?? payload ?? [];
  if (!items.length) return null;
  return items.find((item) => item.isActive)
    ?? [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
}

/** The circle's own links, official site first — its shop, not the catalogue. */
function ownLink(links = {}) {
  const preferred = ['site', 'website', 'twitter', 'youtube', 'sns'];
  for (const key of preferred) if (links[key]?.url) return links[key].url;
  return Object.values(links).find((entry) => entry?.url)?.url;
}

/**
 * One circle → one candidate.
 * @param {object} circle  a row from GET /circles/{edition}
 * @param {{name: string, edition: string, startDate: string, venue?: string}} source
 */
export function mapCircle(circle, source, index = 0) {
  if (!circle?.name || !source?.startDate) return null;

  const keywords = (circle.keywords || []).map((entry) => entry?.text).filter(Boolean);
  const space = [circle.area, circle.number].filter(Boolean).join('-');
  const venue = source.venue || M3_VENUE;
  // `/circles/[circleId]` is a real client-rendered route in the catalogue's
  // build manifest; curl sees only the SPA shell, a browser sees the circle.
  const sourceUrl = `${M3_CATALOG}/${source.edition}/circles/${circle.id}`;

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl,
    title: circle.name,
    startDate: source.startDate,
    place: space ? `${venue} · ${space}` : venue,
    time: '详见活动页',
    price: '详见活动页',
    text: `${circle.name} ${circle.prText || ''} ${keywords.join(' ')} 同人音楽`,
    visualIndex: index,
  });
  if (!candidate) return null;

  // The circle wrote both of these about itself; nothing here is inferred.
  const description = [circle.prText, keywords.length ? `#${keywords.join(' #')}` : '']
    .map((part) => String(part || '').trim()).filter(Boolean).join(' / ');
  const own = ownLink(circle.links);

  return {
    ...candidate,
    ...(genreLabel(circle.genre) ? { category: genreLabel(circle.genre) } : {}),
    ...(description ? { description } : {}),
    ...(own ? { attribution: own } : {}),
    ...(circle.adult ? { audience: 'R-18' } : {}),
  };
}

/** All circles for one edition, already mapped. */
export function mapCircles(payload, source) {
  const items = payload?.items ?? payload ?? [];
  return items.map((circle, index) => mapCircle(circle, source, index)).filter(Boolean);
}
