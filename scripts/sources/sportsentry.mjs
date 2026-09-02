import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * スポーツエントリー (sportsentry.ne.jp) — the sign-up platform behind most
 * of Japan's amateur races and participatory sports events. The Tokyo listing
 * carries 29 categories with a long tail the product wants (ロゲイニング,
 * オリエンテーリング, SUP, スカッシュ, フェンシング…) and is the one source
 * that fills the thin 「新運動」 family (管道设计 第六轮, 2026-08-31).
 *
 * robots.txt: `*` only disallows `/file/`. The site's agreement
 * (`/register/agreement` §8) binds registered members, not readers; the
 * listing is public. Summary + link back, as everywhere else.
 *
 * Listing shape (verified 2026-09-02): 10 items per page, `order=opendate`
 * sorts upcoming events by event date ascending and excludes past ones
 * (the default `evaluation` order mixes in events months gone). A page past
 * the end returns 200 with zero items, so a fixed URL list is safe. Every
 * page also pins one sponsored 「おすすめ」 item at the top with utm noise in
 * its href; the id is normalised so the pool sees one candidate.
 */
export const SPORTSENTRY_ORIGIN = 'https://www.sportsentry.ne.jp';
const LISTING = `${SPORTSENTRY_ORIGIN}/events/tokyo`;

/** ~40 pages ≈ 400 upcoming events; beyond that the listing was empty on 2026-09-02. */
export const SPORTSENTRY_URLS = Array.from({ length: 40 }, (_, index) => `${LISTING}?order=opendate&page=${index + 1}`);

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').trim();
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const DATE = /(20\d{2})年(\d{1,2})月(\d{1,2})日/;

/**
 * The date line comes in several hand-written shapes:
 *   2027年2月21日（日）
 *   2026年10月3日（土）～4日（日）開催        (second day, month inherited)
 *   2026年4月11日（土）、12日（日）開催       (listed days — treat as a span)
 *   2026年9月1日(火) ～ 2026年11月2日(月)     (full second date)
 *   2026年10月18日(日) 9:30-15:00            (with a time)
 *   -                                        (no date: membership registrations)
 */
export function parseEventDate(value = '') {
  const text = compact(value);
  const first = DATE.exec(text);
  if (!first) return { startDate: null, endDate: null, time: null };
  const [, year, month, day] = first;
  const startDate = iso(year, month, day);
  const rest = text.slice(first.index + first[0].length);
  let endDate = null;
  const full = DATE.exec(rest);
  const monthDay = /(\d{1,2})月(\d{1,2})日/.exec(rest);
  const dayOnly = /(?:^|[^\d:])(\d{1,2})日/.exec(rest);
  if (full) endDate = iso(full[1], full[2], full[3]);
  else if (monthDay) endDate = iso(year, monthDay[1], monthDay[2]);
  else if (dayOnly) endDate = iso(year, month, dayOnly[1]);
  if (endDate && endDate <= startDate) endDate = null;
  const time = /(\d{1,2}:\d{2}(?:\s*[-~～〜]\s*\d{1,2}:\d{2})?)/.exec(text)?.[1] ?? null;
  return { startDate, endDate, time };
}

/** `[エントリー]2026年8月15日（土）〜2026年11月3日（火）` → ISO pair; anything else → null. */
export function parseEntryPeriod(value = '') {
  const text = compact(value);
  if (!text.startsWith('[エントリー]')) return null;
  const dates = [...text.matchAll(new RegExp(DATE.source, 'g'))].map(([, y, m, d]) => iso(y, m, d));
  if (!dates.length) return null;
  return { entryStart: dates[0], entryEnd: dates[1] ?? null };
}

export function parseSportsentry(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  $('div.detailSingle').each((index, node) => {
    const item = $(node);
    const link = item.find('.detailSingle__Title h3 a').first();
    const title = compact(link.text());
    const href = link.attr('href');
    if (!title || !href) return;
    if (compact(item.find('.detailSingle__Title--Place').text()) !== '東京都') return;

    const category = compact(item.find('.mainCategory p').first().text());
    // Federation membership registrations are listed like events (some even
    // carry a fiscal-year "date"); nothing there to go to.
    if (category === '協会連盟登録') return;
    const lines = item.find('.detailSingle__Info .textArea p').toArray().map((p) => compact($(p).text()));
    const { startDate, endDate, time } = parseEventDate(lines[0] ?? '');
    if (!startDate) return;
    const place = lines[1] || '东京都内 · 详见主办方';
    const entry = parseEntryPeriod(lines[2] ?? '');
    const tags = item.find('p.tag a').toArray().map((a) => compact($(a).text()).replace(/^＃/, '')).filter(Boolean);

    const sourceUrl = new URL(href, SPORTSENTRY_ORIGIN);
    sourceUrl.search = '';
    const peopleText = compact(item.find('.infoDetail__People p').first().text());
    const popularity = peopleText ? Number.parseInt(peopleText.replace(/[^\d]/g, ''), 10) : NaN;

    const description = [
      entry ? `报名期 ${entry.entryStart}${entry.entryEnd ? ` 〜 ${entry.entryEnd}` : ''}` : null,
      tags.length ? tags.join(' · ') : null,
    ].filter(Boolean).join('｜');

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: sourceUrl.href,
      title,
      startDate,
      endDate: endDate || undefined,
      place,
      time: time ?? '详见活动页',
      price: '详见活动页',
      text: `${title} ${category} ${tags.join(' ')} スポーツ`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({
      ...candidate,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(Number.isFinite(popularity) ? { popularity } : {}),
    });
  });
  return events;
}
