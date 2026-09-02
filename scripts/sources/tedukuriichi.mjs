import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * ものづくり応援団 (tedukuriichi.com) — a nationwide, organiser/reader-submitted
 * directory of 手作り市 (handmade craft markets). It fills the 手作 / craft
 * family that no other source covers, and its long tail is temple-yard and
 * shrine-ground markets that never reach mainstream event sites.
 *
 * robots.txt: 404 on both the bare host and `www.` (verified 2026-09-02);
 * RFC 9309 §2.3.1 — no robots.txt, crawling allowed. The footer carries only a
 * privacy policy; there are no terms restricting reuse of listing data. Summary
 * + link back to the event page, as everywhere else.
 *
 * Host: the bare `tedukuriichi.com` 301s to `www.tedukuriichi.com`, so every
 * URL here uses `www.` directly. Pages are served as UTF-8 (`charset=utf8`
 * header + `<meta charset="utf-8">`), no legacy Shift_JIS despite the old-PHP look.
 *
 * Page shape (verified 2026-09-02): `index.php?mono=searcheventarea&q=13` is
 * the 東京都 schedule (q = JIS prefecture code). It is one `table.layout_3_8`
 * whose header row is a plain `<tr>` of `td.layout_3_19`; every data row has
 * five cells:
 *   1. `td.layout_3_9`   — a 募集 status image (`alt="募集未定"` / `alt="締め切り"`)
 *   2. `td.layout_3_16`  — free-form name, e.g. `布多天神社つくる市 (9月東京都調布市)  毎月第1日曜`
 *   3. `td.layout_3_9`   — `2026/09/06(日)～2026/09/06(日)` (always a concrete range, even for recurring markets)
 *   4. `td.layout_3_9`   — 募集期間 text (`現在募集未定` / `募集終了` / a date range)
 *   5. `td.layout_3_17_2`— `<a href="index.php?mono=event&event_id=N">詳細</a>`
 * The Tokyo page had no pagination (9 rows spanning four months); the
 * all-prefecture page (`q` omitted) paginates with `&p=N`, so a fixed URL
 * list is safe: a page past the end would just carry zero rows.
 *
 * Recurring markets: the listing already expands 毎月第1日曜 into one row per
 * month, each with its own event_id and concrete date, so we take each row as
 * a separate candidate and keep the recurrence phrase in the description. A
 * row whose date cell has no concrete date is skipped — we never guess the
 * next occurrence from the phrase.
 */
export const TEDUKURIICHI_ORIGIN = 'https://www.tedukuriichi.com';

/** JIS prefecture code for 東京都; the same page with `q` omitted is nationwide. */
export const TEDUKURIICHI_TOKYO_PREF_CODE = 13;

export const TEDUKURIICHI_URLS = [
  `${TEDUKURIICHI_ORIGIN}/index.php?mono=searcheventarea&q=${TEDUKURIICHI_TOKYO_PREF_CODE}`,
];

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
  '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
  '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

// Names occasionally carry a zero-width space (U+200B) pasted in by organisers.
const compact = (value = '') => String(value).replace(/[\s　​]+/g, ' ').trim();
const DATE = /(20\d{2})\/(\d{1,2})\/(\d{1,2})/g;
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
/** `毎月8日`, `毎月第1日曜`, `毎月１２日開催`, `毎月第3土曜日定期開催！`, plus an optional `※5月～10月` season note. */
const RECURRENCE = /毎月\s*第?[0-9０-９]+\s*(?:日曜日?|月曜日?|火曜日?|水曜日?|木曜日?|金曜日?|土曜日?|日)(?:開催|定期開催)?[!！]?(?:\s*※[^\s]+)?/;

/** `2026/09/06(日)～2026/09/23(水)` → ISO pair; a single date or a repeated one gives no endDate. */
export function parseDateRange(value = '') {
  const dates = [...compact(value).matchAll(DATE)].map(([, y, m, d]) => iso(y, m, d));
  const startDate = dates[0] ?? null;
  const endDate = dates[1] && dates[1] > dates[0] ? dates[1] : null;
  return { startDate, endDate };
}

/**
 * Pull the structured bits out of a free-form name cell:
 *   `布多天神社つくる市 (9月東京都調布市)  毎月第1日曜`
 *   `お薬師さんの手づくり市（9月・宮城県）毎月8日定期開催！`
 *   `9/13百貨創作祭　神戸 名谷駅前広場`            (no parenthetical at all)
 * The parenthetical is `(<month>月[・]<prefecture><city?>)`; it is stripped from
 * the title, the prefecture is returned for filtering, and the city (if any)
 * becomes the place.
 */
export function parseName(value = '') {
  let text = compact(value);
  let prefecture = null;
  let city = null;
  const paren = /[（(]\s*[0-9０-９]{1,2}\s*月\s*[・･]?\s*([^）)]*)[）)]/.exec(text);
  if (paren) {
    const inner = compact(paren[1]);
    const found = PREFECTURES.find((p) => inner.startsWith(p));
    if (found) {
      prefecture = found;
      city = inner.slice(found.length).trim() || null;
    }
    text = compact(text.slice(0, paren.index) + ' ' + text.slice(paren.index + paren[0].length));
  }
  if (!prefecture) prefecture = PREFECTURES.find((p) => text.includes(p)) ?? null;
  const recurrence = RECURRENCE.exec(text)?.[0] ?? null;
  if (recurrence) text = compact(text.replace(recurrence, ' '));
  return { title: text, prefecture, city, recurrence: recurrence ? compact(recurrence) : null };
}

/** Parse one schedule page. `source.prefecture` (default 東京都) rejects rows that name another prefecture. */
export function parseTedukuriichi(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  const wanted = source?.prefecture ?? '東京都';

  $('table.layout_3_8 tr').each((index, node) => {
    const cells = $(node).children('td');
    if (cells.length < 5 || cells.first().hasClass('layout_3_19')) return;

    const nameCell = cells.filter('.layout_3_16').first();
    const link = cells.last().find('a[href*="event_id="]').first();
    const href = link.attr('href');
    const { title, prefecture, city, recurrence } = parseName(nameCell.text());
    if (!title || !href) return;
    // Rows never state 東京都 explicitly on the Tokyo page in every case, so
    // filter negatively: only a row that names a *different* prefecture is dropped.
    if (prefecture && prefecture !== wanted) return;

    const { startDate, endDate } = parseDateRange(cells.eq(2).text());
    if (!startDate) return;

    const recruiting = compact(cells.eq(3).text());
    const status = compact(cells.first().find('img').attr('alt') ?? '');
    const description = [
      recurrence ? `定期 ${recurrence}` : null,
      recruiting ? `出店募集 ${recruiting}` : status ? `出店募集 ${status}` : null,
    ].filter(Boolean).join('｜');

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: new URL(href, TEDUKURIICHI_ORIGIN).href,
      title,
      startDate,
      endDate: endDate || undefined,
      place: city ? `${wanted}${city}` : `${wanted} · 详见活动页`,
      time: '详见活动页',
      price: '详见活动页',
      text: `${title} 手作り市 マーケット`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({ ...candidate, category: '手作り市', ...(description ? { description } : {}) });
  });
  return events;
}
