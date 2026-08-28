import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 東京の伝統工芸品（東京都産業労働局）— the 「伝統工芸品にふれる公共施設」 list,
 * collected as places.
 *
 * Small, permanent, and hard to find any other way: ward-run craft museums and
 * a craft café that no venue calendar or fair roster reaches — 台東区立江戸下町
 * 伝統工芸館, 工匠壱番館・弐番館, 葛飾区伝統産業館, 篠崎文化プラザ 伝統工芸カフェ,
 * 伝統工芸青山スクエア. Each row carries a postal address and a full access
 * description, which is the bar a `place` has to clear.
 *
 * ## What this source is not
 *
 * The site also has an `/events/` archive, and it is tempting to read it as a
 * stream of craft events. **It is not**: the index lists 32 entries across
 * 2018–2026, three of them in 2026, and the newest is already past. Measured
 * 2026-08-29 rather than assumed — an earlier survey described it as
 * 「全年不断」, which the index does not support. Each entry is genuinely good
 * (会期 / 時間 / 催事名 / 会場+住所 / 主な内容, plus a per-day 製作体験 table),
 * so it may be worth adapting later, but it would need 令和 era-year parsing
 * and multi-section pages (one page can hold both a 七月 and a 十月 開催概要)
 * for three events a year. Not done, deliberately.
 *
 * `/shops/` is only an index of the 41 品目 and links back here; the 〒 on it
 * belong to the bureau's own offices, not to shops. The per-workshop directory
 * exists solely inside a 2017 PDF pamphlet.
 *
 * robots.txt: none (404). Verified 2026-08-29.
 */
export const DENTO_TOKYO_ORIGIN = 'https://www.dento-tokyo.metro.tokyo.lg.jp';
export const FACILITIES_URL = `${DENTO_TOKYO_ORIGIN}/shops/info.html`;

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').trim();

/** `〒111-0032　東京都台東区浅草2-22-13` → the address without the postal code. */
export function parseAddress(value = '') {
  const text = compact(value).replace(/〒\s*\d{3}-?\d{0,4}\s*/, '').trim();
  return /^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)/.test(text) ? text : null;
}

/**
 * Parse the facilities page.
 *
 * Each facility is an `<h2>` name followed by a table whose rows are
 * `所在地 / 電話番号 / アクセス`. The table also repeats the name in its
 * `summary` attribute, which is what this reads — it is on the element being
 * parsed, rather than requiring a walk back to the nearest preceding heading.
 *
 * The phone number is read but deliberately discarded, as in the other place
 * sources. The access description is kept: for a ward museum, "which station,
 * how many minutes" is the useful part.
 *
 * Nine facilities parse, not the ten the raw HTML appears to hold: 葛飾区伝統
 * 産業館's whole block is wrapped in an HTML comment (`<!--h2>…</div-->`), i.e.
 * the bureau took it down without deleting it. cheerio ignores it, which is the
 * right answer — a commented-out entry is not published. Worth knowing before
 * anyone counts `summary=` attributes and files a bug.
 *
 * @param {string} html
 * @param {{name: string, startDate: string}} source
 */
export function parseFacilities(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('table[summary]').each((index, node) => {
    const cell = (label) => {
      const header = $(node).find('th').filter((_, other) => compact($(other).text()) === label).first();
      return compact(header.next('td').text());
    };
    const address = parseAddress(cell('所在地'));
    const title = compact($(node).attr('summary'));
    if (!title || !address) return;

    const access = cell('アクセス');
    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: `${FACILITIES_URL}#${encodeURIComponent(title)}`,
      title,
      startDate: source.startDate,
      place: address,
      time: '详见施设',
      price: '详见施设',
      text: `${title} 伝統工芸 展示 体験 東京`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({
      ...candidate,
      ongoing: true,
      changeType: 'discovery',
      category: '伝統工芸にふれる公共施設',
      ...(access ? { description: access.slice(0, 400) } : {}),
      attribution: '東京都産業労働局「東京の伝統工芸品」',
      why: '区や都が運営する伝統工芸の展示・体験施設。常設なので、思い立った日に行ける。',
    });
  });
  return events;
}
