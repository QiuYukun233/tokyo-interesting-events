import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 東京都立産業貿易センター 台東館 / 浜松町館 — the venue's own event calendar.
 *
 * This is a *discovery* source, and a different shape from every other source
 * here: the others are "one organiser's own events", this one is "whatever
 * anybody booked this hall for". These two halls are where a large share of
 * Tokyo's small 即売会 happen — 爬虫類, アクアリウム, 小動物, 鳥, 昆虫,
 * 手作り, 書道 — run by operators far too small to be worth a per-organiser
 * adapter, and mostly invisible to search. Reading the hall's calendar reaches
 * all of them at once. It is how 「爬虫・奇蟲・珍獣フェア!!」 was found, which
 * five separate keyword searches had missed.
 *
 * Two fields make this unusually cheap to judge, and both are the venue's own
 * records rather than anyone's guess:
 *   `区分`  展示会・見本市 / イベント / 即売会 / 会議・研修・セミナー /
 *           展覧会・発表会 / 試験・審査・競技 / 就活関連
 *   `公開区分`  公開 / 招待 / 関係者のみ — i.e. whether the public may walk in.
 * The latter is mapped onto `audience` so lib/gate.mjs can rule on it, the same
 * way Big Sight's 来場対象者 drives `rule:trade_only_admission`.
 *
 * The calendar is forward-looking only: past months return zero rows, and it
 * runs about ten months ahead. There is no archive, so nothing is lost by
 * crawling it daily, and `sanboUrls()` walks a rolling window of months.
 *
 * robots.txt is `User-agent: * / Disallow:` — the whole site is allowed.
 * Verified 2026-08-28.
 */
export const SANBO_ORIGIN = 'https://www.sanbo.metro.tokyo.lg.jp';

export const SANBO_HALLS = [
  { key: 'taito', name: '東京都立産業貿易センター 台東館', venue: '东京都立产业贸易中心 台东馆（浅草）' },
  { key: 'hamamatsucho', name: '東京都立産業貿易センター 浜松町館', venue: '东京都立产业贸易中心 滨松町馆' },
];

/**
 * A rolling window of month pages starting from this month.
 *
 * The calendar reaches roughly ten months out; asking past that returns an
 * empty (but 200) month, which is harmless. A trailing empty month is normal
 * here and must not be read as a broken parser — see the `empty_parse`
 * baseline note in docs/架构.md.
 */
export function sanboUrls(hallKey, now = new Date(), months = 12) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: months }, (_, index) => {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1));
    // No trailing slash before the query — the site's own links omit it.
    return `${SANBO_ORIGIN}/${hallKey}/event?year=${month.getUTCFullYear()}&month=${month.getUTCMonth() + 1}`;
  });
}

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

/** Strip the `主催者：` / `会場：` label a row prints inside its own value. */
const valueOf = ($, node, selector) => compact($(node).find(selector).first().text().replace(/^[^：:]*[：:]/, ''));

/** `2026/08/01` or `2026/08/01 〜 2026/08/03`. */
export function parseEventDates(value = '') {
  const dates = [...compact(value).matchAll(/(20\d{2})\/(\d{1,2})\/(\d{1,2})/g)]
    .map(([, year, month, day]) => `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  const [startDate, endDate] = dates;
  return { startDate: startDate || null, endDate: endDate && endDate !== startDate ? endDate : null };
}

export function parseSanbo(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('div.event').each((index, node) => {
    const title = compact($(node).find('p.title').first().text());
    const { startDate, endDate } = parseEventDates($(node).find('p.date').first().text());
    if (!title || !startDate) return;

    // 公開 / 招待 / 関係者のみ. A row without the badge is left undeclared
    // rather than assumed public — the gate can only rule on what is stated.
    const admission = compact($(node).find('.event-status span').first().text());
    // 即売会 / 展示会・見本市 / イベント / … — the venue's own booking category.
    const category = compact($(node).find('p.category span[class^="cat"]').first().text());
    const organiser = valueOf($, node, 'p.txt');
    const area = valueOf($, node, 'p.area');
    // Rows with no detail page still carry an anchor, but it is a
    // `javascript:void(0)` placeholder — only a real event path is a link.
    const href = [...$(node).find('a[href]')]
      .map((link) => $(link).attr('href'))
      .find((value) => /\/event\/\d+/.test(value || ''));

    const candidate = createEventCandidate({
      sourceName: source.name,
      // Only 公開 rows carry a detail page; the rest link back to the month.
      sourceUrl: href ? new URL(href, SANBO_ORIGIN).href : source.url,
      title,
      startDate,
      endDate: endDate || undefined,
      place: area ? `${source.venue} · ${area}` : source.venue,
      time: '详见活动页',
      price: '详见活动页',
      text: `${title} ${category}`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({
      ...candidate,
      ...(category ? { category } : {}),
      ...(admission ? { audience: admission } : {}),
      ...(organiser ? { attribution: organiser } : {}),
    });
  });
  return events;
}
