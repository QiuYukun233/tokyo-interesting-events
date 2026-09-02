import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * えん食べ (entabe.jp) — Japan's main aggregator of 期間限定メニュー / 新商品
 * gourmet news. Content skews heavily to national chains: convenience stores,
 * supermarkets, family restaurants, coffee chains, hotel afternoon teas.
 *
 * robots.txt (verified 2026-09-02): `*` disallows only /click/, /ad/ and
 * /smartnews_prs/; the listing and articles are open. The copyright page
 * (/pages/9) permits quotation under 著作権法32条 and asks for prior contact
 * before commercial republication — we publish a title-level summary and
 * link back to the article, nothing more.
 *
 * Listing shape (verified 2026-09-02 on /news/gourmet and /news/gourmet/page:2):
 *   - pagination is `/news/gourmet/page:N`. `?page=N` is silently ignored and
 *     returns page 1 again — the URL list below uses the colon form.
 *   - 15 articles per page inside `.list-pc`, each an `a.news-index-latest`
 *     with `.related-title`, `.related-summary` (a one-paragraph lead) and
 *     `.line-category` (a product-type tag: パスタ, 菓子パン, ホテル, カフェ…).
 *   - the sidebar ranking (`.side`) reuses the exact same `a.news-index-latest`
 *     markup for 5 more items, wrapped in `.side-corner-tag-rank`, and often
 *     shows a different category for the same article. Those are skipped.
 *   - there is NO publish date anywhere on the listing, and no JSON-LD. Dates
 *     have to come from the title/lead text, see `parseEntabeDates`.
 *
 * Keep/drop rule (this pipeline is about things you can go to):
 *   1. DROP when the title names shelf retail — convenience stores,
 *      supermarkets / Costco / KALDI, delivery, mail order, takeout-bento
 *      chains. Those products are bought, not visited.
 *   2. KEEP only when the title or lead names a place type someone can walk
 *      into in Tokyo (カフェ, ホテル, ファミレス, レストラン…) or a known
 *      dine-in chain (スターバックス, コメダ, デニーズ, サーティワン…).
 *   3. Everything else (packaged goods from makers like ロッテ/カゴメ,
 *      round-ups with no venue) is dropped.
 * The category tag on its own is NOT a usable rule: most of the time it is a
 * product type (シュークリーム, ケーキ), not a venue type.
 */
export const ENTABE_ORIGIN = 'https://entabe.jp';
const LISTING = `${ENTABE_ORIGIN}/news/gourmet`;

/** 10 pages × 15 articles ≈ 150 newest articles; the pager showed 11+ pages on 2026-09-02. */
export const ENTABE_URLS = Array.from({ length: 10 }, (_, index) => (index === 0 ? LISTING : `${LISTING}/page:${index + 1}`));

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').trim();
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** Title-level markers of shelf retail: bought off a shelf or delivered, not visited. */
export const RETAIL_PATTERN = /セブン|ファミマ|ファミリーマート|ローソン|ミニストップ|コンビニ|コストコ|カルディ|KALDI|業務スーパー|成城石井|イオン|スーパー|通販|お取り寄せ|オンライン限定|Amazon|楽天|ほっともっと|ほっかほっか亭|宅食|宅配|ドラッグストア|ドン・?キホーテ/i;

/** Dine-in chains with Tokyo stores. First match becomes the candidate's place. */
export const CHAINS = [
  'スターバックス', 'コメダ珈琲店', 'コメダ', 'デニーズ', 'ロイヤルホスト', 'ココス', 'サーティワン', 'ミスタードーナツ', 'ミスド',
  'マクドナルド', 'モスバーガー', 'ケンタッキー', 'バーガーキング', 'フレッシュネスバーガー', 'ドトール', 'タリーズ', 'プロント',
  'カフェ・ベローチェ', 'ベローチェ', '上島珈琲店', '星乃珈琲店', '珈琲館', 'サイゼリヤ', 'ガスト', 'バーミヤン', 'ジョナサン',
  'ビッグボーイ', 'ゆず庵', '丸亀製麺', '吉野家', '松屋', 'すき家', 'スシロー', 'くら寿司', 'はま寿司', 'かっぱ寿司', '銀だこ',
  '一風堂', 'リンガーハット', '大戸屋', 'やよい軒', '資生堂パーラー', 'キハチ', '焼肉きんぐ', '牛角', '日高屋', '餃子の王将',
  'サンマルクカフェ', 'nana\'s green tea', 'ドミノ・ピザ', 'ピザハット', 'ロッテリア', 'ファーストキッチン',
  'てんや', '幸楽苑', 'カプリチョーザ', 'オリーブの丘', 'ジョリーパスタ', '不二家レストラン', 'シャトレーゼ', 'コージーコーナー',
];

/** Generic place types you can walk into. */
export const VENUE_PATTERN = /カフェ|喫茶|珈琲店|ホテル|ファミレス|ファミリーレストラン|レストラン|居酒屋|アフタヌーンティー|かき氷|ビュッフェ|バイキング|食べ放題|店舗限定|都内の店|店頭で|直営店|専門店/;

/**
 * Pull a start/end date out of an article title + lead. Shapes seen on the
 * listing (2026-09-02):
 *   【9月8日～発売】 / 【9月1日発売】 / 9月1日から / 9/1から順次開催
 *   8/31〜9/27まで / 9月8日～9月30日 / 9月30日まで
 *   【2026年9月】 / 2026年9月に (month only) / 【2026年秋】 (season only)
 * Day-level dates are `resolution: 'day'`. When only a month is known the
 * start falls back to the 1st (`'month'`); a bare season falls back to its
 * first month (`'season'`). Callers should treat anything but `'day'` as a
 * "this is on somewhere around now" signal, not a launch date.
 *
 * Years are usually absent from the title, so `today` (default: now) fixes
 * them: a month more than two months in the past is read as next year.
 */
export function parseEntabeDates(text = '', { today = new Date() } = {}) {
  const value = compact(text).replace(/[〜～]/g, '~');
  const explicitYear = /(20\d{2})年/.exec(value)?.[1];
  const nowYear = today.getFullYear();
  const nowMonth = today.getMonth() + 1;
  const yearFor = (month) => {
    if (explicitYear) return Number(explicitYear);
    return month < nowMonth - 2 ? nowYear + 1 : nowYear;
  };

  const DAY = /(?:(20\d{2})年)?(\d{1,2})[月/](\d{1,2})日?/g;
  const dates = [];
  for (const match of value.matchAll(DAY)) {
    const [, year, month, day] = match;
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) continue;
    const at = match.index + match[0].length;
    const untilOnly = /^\s*まで/.test(value.slice(at));
    dates.push({ date: iso(year ? Number(year) : yearFor(m), m, d), untilOnly, month: m });
  }
  if (dates.length) {
    const starts = dates.filter((entry) => !entry.untilOnly);
    const ends = dates.filter((entry) => entry.untilOnly);
    let startDate = starts[0]?.date ?? null;
    let endDate = ends[0]?.date ?? (starts.length > 1 ? starts[1].date : null);
    let resolution = 'day';
    if (!startDate) {
      // "9月30日まで" alone: the thing is already on; anchor to the 1st of that month.
      startDate = iso(endDate.slice(0, 4), ends[0].month, 1);
      resolution = 'month';
    }
    if (endDate && endDate <= startDate) endDate = null;
    return { startDate, endDate, resolution };
  }

  const monthOnly = /(?:20\d{2}年)?(\d{1,2})月/.exec(value);
  if (monthOnly) {
    const m = Number(monthOnly[1]);
    // A bare month is "on now / recently", never a launch announcement, so it
    // stays in the current year even when it is behind today (a 実食 piece
    // about a June product is a past June, not next year's).
    if (m >= 1 && m <= 12) return { startDate: iso(explicitYear ? Number(explicitYear) : nowYear, m, 1), endDate: null, resolution: 'month' };
  }

  const season = /(20\d{2})年(春|夏|秋|冬)/.exec(value);
  if (season) {
    const month = { 春: 3, 夏: 6, 秋: 9, 冬: 12 }[season[2]];
    return { startDate: iso(Number(season[1]), month, 1), endDate: null, resolution: 'season' };
  }
  return { startDate: null, endDate: null, resolution: null };
}

/**
 * Decide whether an article is about somewhere you can go, and if so which
 * brand. `{ keep, brand }` — `brand` is null for generic venue-type matches.
 */
export function classifyEntabe({ title = '', summary = '' } = {}) {
  if (RETAIL_PATTERN.test(title)) return { keep: false, brand: null };
  const both = `${title} ${summary}`;
  const brand = CHAINS.find((chain) => title.includes(chain)) ?? CHAINS.find((chain) => both.includes(chain)) ?? null;
  if (brand) return { keep: true, brand };
  if (VENUE_PATTERN.test(both)) return { keep: true, brand: null };
  return { keep: false, brand: null };
}

const RESOLUTION_NOTE = { day: null, month: '日期只到月（记事未写具体日）', season: '日期只到季节（记事未写具体月）' };

/** Parse one listing page. `source.today` (Date) pins year inference in tests. */
export function parseEntabe(html, source) {
  const $ = cheerio.load(html);
  const events = [];
  const seen = new Set();
  $('a.news-index-latest').each((index, node) => {
    const item = $(node);
    // Sidebar ranking reuses the listing markup; those articles also appear in the main list.
    if (item.closest('.side').length || item.find('.side-corner-tag-rank').length) return;

    const href = item.attr('href');
    const title = compact(item.find('.related-title').first().text());
    if (!href || !title) return;
    const sourceUrl = new URL(href, ENTABE_ORIGIN);
    sourceUrl.search = '';
    if (seen.has(sourceUrl.href)) return;
    seen.add(sourceUrl.href);

    const summary = compact(item.find('.related-summary').first().text());
    const category = compact(item.find('.line-category').first().text());
    const { keep, brand } = classifyEntabe({ title, summary });
    if (!keep) return;

    const { startDate, endDate, resolution } = parseEntabeDates(`${title} ${summary}`, { today: source?.today ?? new Date() });
    if (!startDate) return;

    const buzz = Number.parseInt(compact(item.find('.line-buzz-count').text()).replace(/[^\d]/g, ''), 10);
    const description = [summary || null, RESOLUTION_NOTE[resolution]].filter(Boolean).join('｜');

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: sourceUrl.href,
      title,
      startDate,
      endDate: endDate || undefined,
      place: brand ? `${brand} 都内店舗` : '东京都内 · 详见记事',
      time: '营业时间内',
      price: '详见记事',
      text: `${title} ${category} グルメ 期間限定`,
      visualIndex: index,
    });
    if (!candidate) return;
    events.push({
      ...candidate,
      ...(category ? { category } : {}),
      ...(description ? { description } : {}),
      ...(Number.isFinite(buzz) ? { popularity: buzz } : {}),
    });
  });
  return events;
}
