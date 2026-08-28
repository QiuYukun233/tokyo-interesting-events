import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * モノマチ（台東区 御徒町〜蔵前〜浅草橋）— an オープンファクトリー read as a
 * shop directory.
 *
 * Once a year the makers of 台東区 open their workshops for a weekend: 傘屋,
 * 革小物, 草木染め, 畳, ボタン専門店, アンティーク. The fair is three days, but
 * **the workshops are there the rest of the year** — which is the whole point
 * of collecting these as `place` rather than as an event that expires with the
 * fair. See docs/来源清单.md「展会名单的另一种读法」.
 *
 * This is only the second source to clear that bar, and for the same reason as
 * 東京ミネラルショー: the roster publishes street addresses. Here it does better
 * — 125 of 127 entries carry a full 台東区 address *and* coordinates.
 *
 * The site is a React SPA, but its data is one unauthenticated JSON file:
 *   https://{year}.monomachi.com/monomachi_data_{year}.json   (~1.1MB)
 * `shops` holds the directory; `all_events` holds the weekend's programme,
 * which is genuinely date-bound and is NOT collected here.
 *
 * ## What is deliberately dropped
 *
 * The payload carries `phone` and, scattered through the free-text fields, 92
 * e-mail addresses belonging to individual workshops. Neither is kept: an
 * address is what makes a workshop findable, and compiling small businesses'
 * direct contact details is not this project's business. Same call as
 * tokyo-mineral-show.mjs, and there is a test asserting it.
 *
 * robots.txt: none on the year subdomain (404); the parent monomachi.com only
 * disallows /wp-admin/. No terms forbidding reuse were found (the /press/ page
 * covers press accreditation, not data). Verified 2026-08-28.
 */
export const monomachiDataUrl = (year) => `https://${year}.monomachi.com/monomachi_data_${year}.json`;

/** The fair is in 台東区; the guard is here so a future edition cannot drift. */
export const DEFAULT_PREFECTURE = '東京都';

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();

/** Strip anything that looks like a contact detail out of free text. */
export function withoutContacts(value = '') {
  return compact(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '')
    .replace(/(TEL|FAX|電話)[:：]?\s*[\d-]{9,}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One shop row → one `place` candidate.
 *
 * `changeType: 'discovery'` is what lib/object-type.mjs reads as `place`, and
 * `ongoing: true` keeps it inside the pool's horizon without inventing an end
 * date — a workshop has no closing day.
 *
 * @param {object} shop  a row from the payload's `shops`
 * @param {{name: string, year: number|string, startDate: string, prefecture?: string}} source
 */
export function mapShop(shop, source, index = 0) {
  const name = compact(shop?.name);
  const address = compact(shop?.address);
  const prefecture = source?.prefecture ?? DEFAULT_PREFECTURE;
  // No address means no destination, whatever else the row says.
  if (!name || !address.startsWith(prefecture) || !source?.startDate) return null;

  const category = compact(shop.category);
  const blurb = withoutContacts(shop.text);
  const candidate = createEventCandidate({
    sourceName: source.name,
    // The shop's own site is the better citation when it has one; the fair's
    // directory entry is the fallback, keyed by id so ids stay distinct.
    sourceUrl: compact(shop.url) || `https://${source.year}.monomachi.com/shop.html#${encodeURIComponent(shop.id ?? name)}`,
    title: name,
    startDate: source.startDate,
    place: address,
    time: '详见店铺',
    price: '详见店铺',
    text: `${name} ${category} ${blurb} 台東区 モノマチ 工房`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    ...(category ? { category } : {}),
    ...(blurb ? { description: blurb.slice(0, 400) } : {}),
    attribution: `${source.name} 参加店`,
    why: `${source.name}で工房を開いた台東区の作り手。展示会の会期が終わっても店はそこにある。`,
  };
}

/** Map the payload's `shops`; `all_events` is date-bound and left alone. */
export function mapShops(payload, source) {
  const shops = payload?.shops ?? [];
  return shops.map((shop, index) => mapShop(shop, source, index)).filter(Boolean);
}
