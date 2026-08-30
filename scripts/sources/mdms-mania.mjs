import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * マダミスマニア (mdms-mania.com) — Tokyo murder-mystery (マーダーミステリー)
 * shop directory.
 *
 * `/store/tokyo/` is one long hand-written article, not a structured listing:
 * each shop is an `<h3>` (or, for a chain's other branches, an accordion
 * `<h4 class="swell-block-accordion__label">`) immediately followed by a
 * `<figure class="wp-block-table">` whose rows are keyed by
 * 住所/アクセス/電話番号/営業時間/公式サイト. Some accordions list branches in
 * Osaka/Nagoya alongside Tokyo ones, so shops are kept by their own 住所
 * rather than by which section of the article they sit in.
 *
 * These are places, not dated events — a shop doesn't start or end, so
 * `startDate` comes from the crawl date (like scripts/sources/nakano-broadway.mjs)
 * and `ongoing: true` marks it as not subject to the "already ended" filter.
 *
 * robots.txt only disallows /wp-admin/; no separate terms-of-use page limits reuse.
 */
const compact = (value = '') => String(value).replace(/\s+/g, ' ').replace(/[–—]/g, '').trim();

function readShopTable($, table) {
  const fields = {};
  $(table).find('tr').each((_, row) => {
    const key = compact($(row).find('th').first().text());
    const cell = $(row).find('td').first();
    if (key === '公式サイト') fields.url = cell.find('a').first().attr('href') || null;
    else if (key) fields[key] = compact(cell.text());
  });
  return fields;
}

export function parseMdmsMania(html, source) {
  const $ = cheerio.load(html);
  const shops = [];
  let pendingName = null;

  $('h3.wp-block-heading, h4.swell-block-accordion__label, figure.wp-block-table').each((_, node) => {
    if (node.tagName === 'figure') {
      if (!pendingName) return;
      const fields = readShopTable($, node);
      if (fields['住所']) shops.push({ name: pendingName, ...fields });
      pendingName = null;
      return;
    }
    const name = compact($(node).text());
    if (name) pendingName = name;
  });

  const tokyoShops = shops.filter((shop) => shop['住所'].startsWith('東京都'));

  return tokyoShops.map((shop, index) => {
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: shop.url || source.url,
      title: shop.name,
      startDate: source.startDate,
      place: shop['住所'],
      time: shop['営業時間'] || '详见活动页',
      price: '详见活动页',
      text: `${shop.name} ${shop['アクセス'] || ''}`,
      visualIndex: index,
    });
    return candidate && { ...candidate, ongoing: true, category: 'マーダーミステリー' };
  }).filter(Boolean);
}
