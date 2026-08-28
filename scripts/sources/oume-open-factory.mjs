import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * おうめオープンファクトリー（青梅市）— workshops in Tokyo's western edge,
 * read as places.
 *
 * Same treatment as モノマチ and おおたオープンファクトリー: the event is a few
 * days, the workshops are there all year, so these become `place` candidates.
 * 青梅 is far enough out that "worth a special trip" is literally true — a sake
 * brewery founded in 1702, a stonemason, a natto maker, a glass works.
 *
 * The cheapest of the three by a wide margin: **the whole roster is one page**.
 * Every workshop is a `div.factory` card carrying its own number, name, a
 * one-line hook, and a `<p>` holding 住所 / 電話 / 公式URL on three lines, plus
 * a 事業内容 definition list. No detail pages, no API, one request for ~35 rows.
 *
 * ## Parsing notes
 *
 * - The address block is a single `<p>` with `<br>` separators, so it is split
 *   on lines rather than selected: line 1 is the address, line 2 the phone,
 *   line 3 the site. Reading it as one string would put the phone number into
 *   the address.
 * - Addresses omit the prefecture (「青梅市沢井2-770」), like 大田区's do.
 * - Some addresses carry a parenthetical qualifier — 「青梅市梅郷6-1438-1(作業場)」
 *   — which is kept: it tells the visitor which of a company's buildings to go to.
 * - The number is inside the `<h3>` as a `<b>`, so it must be removed from the
 *   name rather than left as 「01小澤酒造株式会社」.
 *
 * Phone numbers are dropped, as in the sibling sources.
 *
 * robots.txt disallows only /wp-admin/. Verified 2026-08-29.
 */
export const OUME_URL = 'https://www.omecci.jp/chokotto_zemi/open_factory';

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();

/** 青梅市 addresses are written without the prefecture; put it back. */
export function normaliseAddress(value = '') {
  const text = compact(value);
  if (!text) return null;
  if (/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(text)) return text;
  return /^[^\s]*[区市町村]/.test(text) ? `東京都${text}` : null;
}

/**
 * Split the address `<p>` into its three lines.
 * @returns {{address: string|null, site: string|null}}
 */
export function parseContactBlock($, node) {
  const lines = ($(node).html() || '')
    .split(/<br\s*\/?>/i)
    .map((line) => compact(cheerio.load(`<div>${line}</div>`).root().text()))
    .filter(Boolean);
  const address = normaliseAddress(lines[0]);
  const site = $(node).find('a[href^="http"]').first().attr('href') || null;
  return { address, site };
}

/**
 * Parse the single roster page.
 * @param {string} html
 * @param {{name: string, startDate: string}} source
 */
export function parseOumeFactories(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('#factory div.factory').each((index, node) => {
    const heading = $(node).find('h3').first();
    const number = compact(heading.find('b').first().text());
    // Removing the <b> leaves the name; otherwise it reads 「01小澤酒造株式会社」.
    const title = compact(heading.clone().find('b').remove().end().text());
    const hook = compact($(node).find('h4').first().text());
    const { address, site } = parseContactBlock($, $(node).find('.col > p').first());
    if (!title || !address) return;

    const business = compact($(node).find('dd').first().text());
    const summary = [hook, business].filter(Boolean).join(' ');
    const candidate = createEventCandidate({
      sourceName: source.name,
      // The company's own site is the better citation; the roster anchor is the
      // fallback and keeps ids distinct.
      sourceUrl: site || `${OUME_URL}#factory${number.padStart(2, '0') || index + 1}`,
      title,
      startDate: source.startDate,
      place: address,
      time: '详见工房',
      price: '详见工房',
      text: `${title} ${summary} 青梅市 町工場 オープンファクトリー`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({
      ...candidate,
      ongoing: true,
      changeType: 'discovery',
      category: '町工場・工房',
      ...(summary ? { description: summary.slice(0, 400) } : {}),
      attribution: `${source.name} 参加ファクトリー`,
      why: `${source.name}で見学を受け入れた青梅の作り手。イベントが終わっても工房はそこにある。`,
    });
  });
  return events;
}
