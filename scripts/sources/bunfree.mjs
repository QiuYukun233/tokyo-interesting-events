import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 文学フリマ東京 — the Web カタログ's full exhibitor list.
 *
 * A literary self-publishing fair: ~3,200 exhibitors at 東京ビッグサイト, twice a
 * year, selling work they wrote and printed themselves. What makes it worth
 * adapting is the category vocabulary, which the exhibitor picks from the
 * organiser's own two-level taxonomy: 詩歌|現代詩・散文詩, 小説|妖怪・もののけ,
 * 評論・研究|建築・都市計画, 評論・研究|食文化. That is plan §3.2's long tail
 * already labelled, by the people who made the thing.
 *
 * `/c/{edition}/all/50` renders **every exhibitor in one 1.6MB page** — booth,
 * name, detail link and category per row — so a full collection is a single
 * request. The per-exhibitor pages (紹介文, SNS, 販売物) would cost ~3,200 more
 * and are deliberately not fetched.
 *
 * ## Access constraints (measured 2026-08-28, both are real)
 *
 * 1. **User-Agent.** A short or generic UA is refused: empty, `curl/8.0` and a
 *    bare `Mozilla/5.0` all returned 403 from an address that works. This
 *    project's own descriptive UA returns 200, and so does a full browser UA.
 *    Nothing here needs pretending to be a browser — just do not send a stub.
 * 2. **Japanese IP.** 利用規約 states it outright: 「不正アクセス防止の観点から、
 *    日本国外のIPアドレス・匿名プロキシ・匿名VPN (Tor など) 等を経由した通信…
 *    を自動的に遮断する場合があります」. This is declared policy, not a guess.
 *
 * Together these mean **this source cannot run in CI**: GitHub Actions egresses
 * from outside Japan. It is a locally-run collector, which is also why it is
 * not in the daily registry — see scripts/collect-bunfree.mjs.
 *
 * robots.txt allows `/c/`; it disallows only /anonymous /admin /api /error
 * /payment /legal, and separately blocks a long list of named SEO and archive
 * bots. Ours is not among them. 利用規約 §3 says submitted content may be
 * republished on other sites, and sets no scraping prohibition.
 */
export const BUNFREE_CATALOG = 'https://c.bunfree.net';

/** Every exhibitor on one page, 50音順. `booth` is the same list ordered by space. */
export const listUrl = (edition, order = '50') => `${BUNFREE_CATALOG}/c/${edition}/all/${order}`;

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();

/**
 * The page header states the edition's date and hall, e.g.
 * 「文学フリマ東京42」(2026/5/4、東京ビッグサイト) の全出店者リストです。
 * Taking them from here keeps the caller from having to hardcode a date that
 * the catalogue already knows.
 */
export function parseEditionMeta(html) {
  const $ = cheerio.load(html);
  const description = $('meta[name="description"]').attr('content') || '';
  const name = compact($('meta[property="og:title"]').attr('content') || '').replace(/\s*出店者リスト$/, '');
  const match = description.match(/\((20\d{2})\/(\d{1,2})\/(\d{1,2})[^、]*、([^)]*)\)/);
  return {
    name: name || null,
    startDate: match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null,
    venue: match ? compact(match[4]) : null,
  };
}

/**
 * Parse the all-exhibitors table.
 *
 * Row shape: `<td>flags</td><td>hall&nbsp;booth</td><td><a>name</a></td><td>category</td>`.
 * Rows are keyed off the exhibitor link, so the flag buttons and any header
 * row are skipped without depending on column counts.
 *
 * @param {string} html
 * @param {{name: string, edition: string, startDate: string, venue: string}} source
 */
export function parseBunfree(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('tr').each((index, node) => {
    const cells = $(node).find('td');
    const link = $(node).find(`a[href*="/c/${source.edition}/"]`).first();
    const title = compact(link.text());
    const href = link.attr('href');
    if (!title || !href) return;

    // The booth cell is the one before the name; the category the one after.
    const nameCellIndex = cells.index(link.closest('td'));
    const space = compact($(cells[nameCellIndex - 1]).text());
    const category = compact($(cells[nameCellIndex + 1]).text());

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, BUNFREE_CATALOG).href,
      title,
      startDate: source.startDate,
      place: space ? `${source.venue} · ${space}` : source.venue,
      time: source.time || '详见活动页',
      price: '详见活动页',
      text: `${title} ${category} 文学フリマ 同人誌 リトルプレス`,
      visualIndex: index,
    });
    if (candidate) events.push({ ...candidate, ...(category ? { category } : {}) });
  });
  return events;
}
