import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 東京ミネラルショー — read as a **shop directory**, not an event roster.
 *
 * This is the first source collected for what the exhibitor *is* rather than
 * for the day it appears. A fair's exhibitor list is a way of finding shops;
 * the shop outlasts the fair. Modelling these rows as dated events made them
 * expire with the fair's date, which is backwards: 「世界の化石販売 KASEKIYA,
 * 八王子市堀之内」 is still open next month.
 *
 * That reframing only works where there is evidence of a place you can walk
 * into, and this list is the cleanest case in the whole survey: the organiser
 * prints each exhibitor's postal address next to its booth. No inference is
 * needed, so nothing is guessed. Fairs whose exhibitors are individual makers
 * (Design Festa, 文学フリマ, 手作りマルシェ) mostly have no premises, and must
 * not be swept into this treatment on the strength of this one working.
 *
 * Candidates carry `changeType: 'discovery'`, which lib/object-type.mjs maps to
 * `place`（值得专程去的场所）— the model already had the right box.
 *
 * ## Layout
 *
 * Each exhibitor is **two table rows**: a data row (社名 / 会場 / エリア /
 * ブースNo) followed by a single-cell row holding 〒, address and a phone or
 * e-mail. The pages are one per 50音 group plus two for overseas dealers; あ行
 * lives on `/exhibitor/` itself rather than a `list_*` slug.
 *
 * ## What is deliberately not collected
 *
 * The contact cell's phone numbers and e-mail addresses are dropped. Several
 * are private-looking addresses that the organiser deliberately obfuscated
 * (`kazariya.akitsu3☆gmail.com`) — scraping around that would defeat a
 * measure taken on the exhibitor's behalf. The address is what makes the shop
 * findable, and that is all this keeps.
 *
 * Overseas and out-of-prefecture dealers are dropped too: a mineral shop in
 * 甲府 is a real shop, but not a destination for a Tokyo discovery queue. Same
 * client-side filter as corich.mjs, for the same reason.
 *
 * robots.txt allows everything but /wp-admin/. Verified 2026-08-28.
 */
export const MINERAL_SHOW_ORIGIN = 'https://www.tokyomineralshow.com';

/** WordPress page slugs holding the list; あ行 is the section index itself. */
export const MINERAL_SHOW_PAGES = [
  { slug: 'exhibitor', label: 'あ行' },
  { slug: 'list_ka', label: 'か行' },
  { slug: 'list_sa', label: 'さ行' },
  { slug: 'list_ta', label: 'た行' },
  { slug: 'list_na', label: 'な行' },
  { slug: 'list_ha', label: 'は行' },
  { slug: 'list_ma', label: 'ま行' },
  { slug: 'list_ya', label: 'や・ら・わ行' },
  { slug: 'list_foreign', label: '海外 A-L' },
  { slug: 'list_foreign_2', label: '海外 M-' },
];

export const pageApiUrl = (slug) => `${MINERAL_SHOW_ORIGIN}/wp-json/wp/v2/pages?slug=${slug}&_fields=slug,link,content`;

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();

/** Rows whose text is navigation or a column header, not an exhibitor. */
const NOISE = /^(社名|会場|エリア|ブースNo|住所|国内業者|海外業者|あ行|か行|さ行|た行|な行|は行|ま行|や・ら・わ行|海外)/;

/**
 * Pull the street address out of the contact cell, dropping 〒 and any phone
 * or e-mail that follows it.
 *
 * Some exhibitors publish only a prefecture and city (「山梨県甲府市」) and no
 * street; those are kept as-is — partial is still true, and the ward is what a
 * reader needs first.
 */
export function parseAddress(value = '') {
  const text = compact(value)
    .replace(/〒?\s*\d{3}-?\d{0,4}\s*/, ' ')          // postal code
    .replace(/[\w.+-]+\s*[@☆★＠]\s*[\w.-]+/g, ' ')     // e-mail, obfuscated or not
    .replace(/(TEL|FAX|電話)?\s*0\d{1,4}-\d{1,4}-\d{3,4}/gi, ' ') // phone
    .replace(/\s+/g, ' ')
    .trim();
  const match = text.match(/(北海道|東京都|(?:京都|大阪)府|.{2,3}県)(.*)/);
  return match ? compact(`${match[1]}${match[2]}`) : null;
}

/** Is this address inside the prefecture we collect for? */
export const isInPrefecture = (address, prefecture = '東京都') => Boolean(address) && address.startsWith(prefecture);

/**
 * Parse one 50音 page into shop rows.
 * Returns every row, unfiltered — the caller decides on prefecture.
 */
export function parseMineralShowPage(html, { label } = {}) {
  const $ = cheerio.load(html);
  const rows = $('tr').toArray();
  const shops = [];
  for (let index = 0; index < rows.length; index += 1) {
    const cells = $(rows[index]).find('td, th').toArray().map((cell) => compact($(cell).text()));
    // A data row has the four booth columns; a name alone is not enough.
    if (cells.length < 4) continue;
    const [name, hall, area, booth] = cells;
    if (!name || NOISE.test(name)) continue;

    // The contact cell is the next row, which has a single (colspan) cell.
    const next = $(rows[index + 1]).find('td, th').toArray().map((cell) => compact($(cell).text()));
    const address = next.length === 1 ? parseAddress(next[0]) : null;
    shops.push({ name, hall, area, booth, address, group: label });
  }
  return shops;
}

/**
 * One directory row → one `place` candidate.
 *
 * `changeType: 'discovery'` is what makes lib/object-type.mjs call this a place
 * rather than a dated event. `startDate` is the day we learned of it, matching
 * how the shop-lifecycle family records a discovery.
 *
 * Known gap, same one scrap.mjs documents: the pool has no "ongoing, no known
 * end" concept, and its horizon filter reads a missing endDate as a single-day
 * event. A shop would therefore vanish the day after it was collected, so an
 * endDate a year out is written to keep it visible until a later run refreshes
 * it. That is a workaround for a missing concept, not a claim about the shop.
 */
export function mapShop(shop, source, index = 0) {
  if (!shop?.name || !shop?.address || !source?.startDate) return null;
  const candidate = createEventCandidate({
    sourceName: source.name,
    // The directory page is the citation; the fragment keeps ids distinct.
    sourceUrl: `${source.link || MINERAL_SHOW_ORIGIN}#${encodeURIComponent(shop.name)}`,
    title: shop.name,
    startDate: source.startDate,
    endDate: source.endDate,
    place: shop.address,
    time: '详见店铺',
    price: '详见店铺',
    text: `${shop.name} 鉱物 化石 隕石 標本 専門店`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    changeType: 'discovery',
    category: '鉱物・化石・隕石の店',
    attribution: source.attribution || '東京ミネラルショー 出展者情報',
    why: `${source.name}の出展者。${shop.booth ? `会場${shop.hall}・${shop.area}エリア ブース${shop.booth}。` : ''}`,
  };
}
