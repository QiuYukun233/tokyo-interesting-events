import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * おおたオープンファクトリー（大田区）— machine shops, read as places.
 *
 * 大田区 is Tokyo's densest concentration of small metalworking 町工場, and once
 * a year about thirty of them open their doors. Like モノマチ, the fair is one
 * day but the workshops are there all year, so these are collected as `place`
 * candidates rather than as an event that expires — see docs/来源清单.md
 * 「展会名单的另一种读法」.
 *
 * Two-stage, because the two halves of the data live apart:
 *   1. `wp-json/wp/v2/posts?per_page=100` on the edition's site enumerates the
 *      workshops (id, title, link). Clean, one request, no HTML parsing.
 *   2. Each detail page carries the fields that matter — 住所 above all, plus
 *      日ごろの業務内容 / 出来上がる製品 / 開催時間 / 内容 / 会社URL.
 *
 * The REST `content.rendered` holds only a one-line tagline, so stage 2 is not
 * optional; there is no shortcut that yields addresses.
 *
 * ## Two things the markup does that trip up naive parsing
 *
 * - **Addresses omit the prefecture**: 「大田区下丸子4-19-20」, not 「東京都大田区…」.
 *   A `startsWith('東京都')` check — which is how the other shop sources filter —
 *   would reject every single row. `normaliseAddress` adds the prefix back.
 * - The 住所 cell wraps the text in a Google Maps link whose query string holds
 *   the coordinates, so the visible address must be read from the `<span>`,
 *   not from the href.
 *
 * Phone and fax numbers are present and deliberately dropped, as with
 * tokyo-mineral-show.mjs and monomachi.mjs.
 *
 * robots.txt disallows only `/ota2022/wp-admin/`. No terms forbidding reuse
 * were found. Verified 2026-08-29.
 */
export const OOTA_ORIGIN = 'https://www.o-2.jp';

export const editionBase = (year) => `${OOTA_ORIGIN}/mono/oof${year}`;
export const editionPostsUrl = (year) => `${editionBase(year)}/wp-json/wp/v2/posts?per_page=100&_fields=id,link,title`;

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();

/**
 * Normalise the 住所 cell into one address.
 *
 * Two shapes have to survive: the ordinary 「大田区下丸子4-19-20」, and the
 * multi-site case where the cell lists several numbered addresses —
 * 「① 大田区下丸子2-11-1（多摩川工場）※工場見学ツアー住所 ② 大田区下丸子2-11-8（…）」.
 * The first entry is the one the fair sends visitors to, so later entries and
 * the ※ footnote are cut. Without this, 白洋舍 was silently dropped for having
 * "no address" while listing two.
 *
 * The prefecture is added back because this site always omits it.
 */
export function normaliseAddress(value = '') {
  const text = compact(value)
    .replace(/^[\s①-⑳⓪0-9０-９.．)）\]】、,]+/, '')  // leading marker on the first entry
    .split(/[②-⑳]/)[0]                                // anything after it is another site
    .split('※')[0]                                    // trailing footnote
    // A few rows label the value: 「【開催場所】東京都大田区…」. Left in, the
    // prefecture test below fails and the result reads 東京都【開催場所】東京都….
    .replace(/^【[^】]*】\s*/, '')
    .trim();
  if (!text) return null;
  if (/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(text)) return text;
  return /^[^\s]*[区市町村]/.test(text) ? `東京都${text}` : null;
}

/**
 * Parse one workshop's detail page.
 * @param {string} html
 * @param {{name: string, startDate: string, link?: string}} source
 */
export function parseFactory(html, source, link) {
  const $ = cheerio.load(html);
  // `<th>label</th><td>value</td>` for the table half, `<dt>/<dd>` for the prose half.
  const cell = (label) => compact($('th').filter((_, node) => compact($(node).text()) === label).first().next('td').text());
  const term = (label) => compact($('dt').filter((_, node) => compact($(node).text()) === label).first().next('dd').text());

  // The page has no <h1>; the workshop's name is the <title> before the ` | `,
  // and `.l-title` repeats it followed by the area it sits in.
  const title = compact($('title').first().text()).split('|')[0].trim();
  const area = compact($('.l-title').first().text()).replace(title, '').trim();
  const address = normaliseAddress(cell('住所'));
  if (!title || !address) return null;

  const summary = [term('日ごろの業務内容'), term('出来上がる製品') && `作るもの：${term('出来上がる製品')}`]
    .filter(Boolean).join(' ');
  const site = $('th').filter((_, node) => compact($(node).text()) === '会社URL').first().next('td').find('a[href^="http"]').first().attr('href');

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: site || link || editionBase(source.year),
    title,
    startDate: source.startDate,
    place: area ? `${address}（${area}）` : address,
    time: '详见工房',
    price: '详见工房',
    text: `${title} ${summary} 大田区 町工場 オープンファクトリー`,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    category: '町工場',
    ...(summary ? { description: summary.slice(0, 400) } : {}),
    attribution: `${source.name} オープン工場`,
    why: `${source.name}で見学を受け入れた大田区の町工場。イベントが終わっても工場はそこにある。`,
  };
}
