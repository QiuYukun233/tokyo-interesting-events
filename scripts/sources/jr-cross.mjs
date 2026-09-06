import { XMLParser } from 'fast-xml-parser';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const JR_CROSS_ORIGIN = 'https://www.jr-cross.co.jp';

export function tokyoYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(now));
}

export function jrCrossNewsUrl(now = new Date()) {
  return `${JR_CROSS_ORIGIN}/info/xml/newslist_${tokyoYear(now)}.xml`;
}

const LIFECYCLE = /新店舗|新装|移転|閉店|リニューアル|オープン|開業/;
const EXCLUDED = /校内店|フェア|キャンペーン|新商品|販売開始|ランキング|限定商品|周年|開業から\s*\d+\s*年|開業\s*\d+\s*周年/;

// A title must identify a destination in Tokyo. Generic "エキュート" news
// and nationwide brand releases are intentionally not enough evidence.
export const TOKYO_FACILITIES = [
  { pattern: /グランスタ(?:東京)?/, place: '东京站 · Gransta' },
  { pattern: /(?:JR)?東京駅|東京ステーション/, place: '东京站' },
  { pattern: /エキュート品川|(?:JR)?品川駅/, place: '品川站 · Ecute' },
  { pattern: /エキュート上野|(?:JR)?上野駅/, place: '上野站 · Ecute' },
  { pattern: /エキュート秋葉原|(?:JR)?秋葉原駅/, place: '秋叶原站 · Ecute' },
  { pattern: /エキュート(?:エディション)?新宿|(?:JR)?新宿駅/, place: '新宿站' },
  { pattern: /(?:JR)?渋谷駅/, place: '涩谷站' },
  { pattern: /エキュート立川|(?:JR)?立川駅/, place: '立川站 · Ecute' },
  { pattern: /エキュート日暮里|(?:JR)?日暮里駅/, place: '日暮里站' },
  { pattern: /エキュート(?:エディション)?御茶ノ水|(?:JR)?御茶ノ水駅/, place: '御茶之水站 · Ecute Edition' },
  { pattern: /エキュート(?:エディション)?有楽町|(?:JR)?有楽町駅/, place: '有乐町站' },
  { pattern: /(?:JR)?池袋駅/, place: '池袋站' },
];

const compact = (value = '') => String(value).replace(/[\s\u3000]+/g, ' ').trim();
const normalized = (value = '') => compact(value).normalize('NFKC');
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function findTokyoFacility(title = '') {
  return TOKYO_FACILITIES.find(({ pattern }) => pattern.test(normalized(title))) ?? null;
}

export function lifecycleTypeFor(title = '') {
  const value = normalized(title);
  if (!LIFECYCLE.test(value) || EXCLUDED.test(value)) return null;
  if (/閉店/.test(value)) return 'closing';
  if (/移転|新装|リニューアル/.test(value)) return 'discovery';
  return 'opening';
}

export function publicationDate(value = '') {
  const match = normalized(value).match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  return match ? iso(match[1], match[2], match[3]) : null;
}

/**
 * A date explicitly printed in the title is the only change date we claim.
 * Month/day-only notices are read against their publication date, including
 * the ordinary December-to-January rollover. Anything else is publication
 * dated and marked as such for the review queue.
 */
export function titledChangeDate(title = '', publishedDate = '') {
  const value = normalized(title);
  const full = value.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (full) return iso(full[1], full[2], full[3]);
  const short = value.match(/(?:^|[^\d])(\d{1,2})(?:月|\/)\s*(\d{1,2})日?/);
  if (!short || !publishedDate) return null;
  const [year, publishedMonth] = publishedDate.split('-').map(Number);
  const month = Number(short[1]);
  const day = Number(short[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return iso(publishedMonth === 12 && month === 1 ? year + 1 : year, month, day);
}

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

/**
 * Read only title-level facts from the official index. In particular, do not
 * fetch its linked PDFs or retain their prose/thumbnails. One XML item stays
 * one candidate, even where a release mentions several shops.
 */
export function parseJrCross(xml, source = {}) {
  const parser = new XMLParser({ trimValues: true });
  const payload = parser.parse(xml);
  const items = asArray(payload?.newsdata?.item);
  const origin = source.origin || JR_CROSS_ORIGIN;

  return items.flatMap((item, index) => {
    // Development Company owns the station retail facilities. Restricting to
    // it avoids retail/product announcements that merely happen to say "new".
    if (compact(item.companyid) !== 'dev') return [];
    const title = compact(item.text);
    const changeType = lifecycleTypeFor(title);
    const facility = findTokyoFacility(title);
    const publishedDate = publicationDate(item.date);
    if (!title || !changeType || !facility || !publishedDate) return [];

    const changeDate = titledChangeDate(title, publishedDate);
    const sourceUrl = new URL(compact(item.url), origin).href;
    const candidate = createEventCandidate({
      sourceName: source.name || 'JR-Cross',
      sourceUrl,
      title,
      startDate: changeDate || publishedDate,
      place: facility.place,
      time: changeDate ? '标题所载开业／变更日期' : '公告发布日期（标题未注明具体开业／变更日期）',
      price: '不适用',
      text: changeType,
      visualIndex: index,
    });
    if (!candidate) return [];

    return [{
      ...candidate,
      changeType,
      ongoing: changeType !== 'closing',
      attribution: 'JR-Cross デベロップメントカンパニー公式公告',
      description: changeDate
        ? '日期精度：标题所载开业／变更日期'
        : '日期精度：公告发布日期（标题未注明具体开业／变更日期）',
    }];
  });
}
