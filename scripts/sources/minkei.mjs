import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * みんなの経済新聞 — one parser, many editions.
 *
 * The network runs ~15 reachable Tokyo-area editions on identical markup
 * (`/headline/NNNN/` article URLs, a `meta[name=description]` summary, a `time`
 * element). Previously two of them had separate hand-copied adapters that had
 * already drifted apart; the Ikebukuro copy had grown a not-a-shop-change guard
 * and an age cutoff the Shibuya copy lacked. This file keeps the stricter
 * behaviour of the two and expresses each edition as configuration.
 *
 * This network is also how the plan's two empty source families get filled:
 * it reports independent bookshops, live houses, small theatres, sento and
 * model shops — the 小型文化与亚文化 and 店铺生命周期 families.
 *
 * Only shop *changes* are collected, never articles in general: the pipeline
 * exists to find places worth going, not to mirror a newspaper.
 */

const OPENING = /オープン|出店|開業|新店|開設/;
const CLOSING = /閉店|閉業|営業終了|撤退/;
const DISCOVERY = /リニューアル|移転|新業態|ポップアップ|限定店|復活/;

/**
 * Titles that match OPENING/CLOSING wording but are really promotions.
 * Without this, "○周年記念フェア" reads as a shop opening.
 */
const NOT_A_SHOP_CHANGE = /周年記念|記念企画|フェア|セール|販売|イベント|キャンペーン|大会|祭|盆踊り/;

/** Reachable Tokyo-area editions, verified 2026-08-28; robots.txt allows all. */
export const MINKEI_EDITIONS = [
  { name: 'シブヤ経済新聞', origin: 'https://www.shibukei.com', area: '涩谷', wards: ['渋谷区'] },
  { name: '池袋経済新聞', origin: 'https://ikebukuro.keizai.biz', area: '池袋', wards: ['豊島区', '板橋区', '北区', '練馬区'] },
  { name: '銀座経済新聞', origin: 'https://ginza.keizai.biz', area: '银座', wards: ['中央区', '千代田区'] },
  { name: '新宿経済新聞', origin: 'https://shinjuku.keizai.biz', area: '新宿', wards: ['新宿区'] },
  { name: 'アキバ経済新聞', origin: 'https://akiba.keizai.biz', area: '秋叶原', wards: ['千代田区', '台東区'] },
  { name: '六本木経済新聞', origin: 'https://roppongi.keizai.biz', area: '六本木', wards: ['港区'] },
  { name: '高円寺経済新聞', origin: 'https://koenji.keizai.biz', area: '高圆寺', wards: ['杉並区'] },
  { name: '下北沢経済新聞', origin: 'https://shimokita.keizai.biz', area: '下北泽', wards: ['世田谷区'] },
  { name: '吉祥寺経済新聞', origin: 'https://kichijoji.keizai.biz', area: '吉祥寺', wards: ['武蔵野市', '三鷹市'] },
  { name: '浅草経済新聞', origin: 'https://asakusa.keizai.biz', area: '浅草', wards: ['台東区', '墨田区'] },
  { name: '品川経済新聞', origin: 'https://shinagawa.keizai.biz', area: '品川', wards: ['品川区', '港区'] },
  { name: '町田経済新聞', origin: 'https://machida.keizai.biz', area: '町田', wards: ['町田市'] },
  { name: '八王子経済新聞', origin: 'https://hachioji.keizai.biz', area: '八王子', wards: ['八王子市'] },
  { name: '立川経済新聞', origin: 'https://tachikawa.keizai.biz', area: '立川', wards: ['立川市'] },
  { name: '練馬経済新聞', origin: 'https://nerima.keizai.biz', area: '练马', wards: ['練馬区'] },
];

const compact = (value = '') => String(value).replace(/\s+/g, ' ').trim();

export function changeTypeFor(text) {
  if (NOT_A_SHOP_CHANGE.test(text)) return null;
  if (CLOSING.test(text)) return 'closing';
  if (OPENING.test(text)) return 'opening';
  if (DISCOVERY.test(text)) return 'discovery';
  return null;
}

export function isoDate(value = '') {
  const match = compact(value).match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

/**
 * Articles say "9月20日" without a year. Read it relative to the publication
 * date, rolling into next year only for the December→January wrap.
 */
export function describedChangeDate(description, publishedDate) {
  const match = String(description).match(/(\d{1,2})月\s*(\d{1,2})日/);
  if (!match || !publishedDate) return null;
  const published = new Date(`${publishedDate}T00:00:00+09:00`);
  const month = Number(match[1]);
  const year = published.getMonth() + 1 === 12 && month === 1 ? published.getFullYear() + 1 : published.getFullYear();
  return `${year}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

/** Prefer a ward named in the article; otherwise say which edition covered it. */
export function placeFrom(description, edition) {
  const wards = edition?.wards?.length ? edition.wards : ['東京都'];
  const match = String(description).match(new RegExp(`((?:${wards.join('|')})[^、。)）]*)`));
  return match?.[1] || `${edition?.area || '东京'}周边 · 详见报道`;
}

/** Pull shop-change leads off an edition's homepage. */
export function parseMinkeiHomepage(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const leads = [];
  $('a[href*="/headline/"]').each((_, node) => {
    const link = $(node);
    const href = link.attr('href');
    if (!href) return;
    const sourceUrl = new URL(href, source.url || source.origin).href;
    if (seen.has(sourceUrl)) return;
    const title = compact(link.find('h2, h3, h4').first().text());
    const changeType = changeTypeFor(title);
    if (!title || !changeType) return;
    seen.add(sourceUrl);
    leads.push({ title, sourceUrl, changeType, category: compact(link.find('span').first().text()) });
  });
  return leads;
}

/**
 * Derive facts from an article's metadata. The summary itself is not retained —
 * the site keeps only its own short description and always links back.
 */
export function parseMinkeiArticle(html, lead, source) {
  const $ = cheerio.load(html);
  const metadata = compact($('meta[name="description"]').attr('content') || '');
  const publishedDate = isoDate(compact($('time').first().text()));
  if (!publishedDate) return null;
  const startDate = describedChangeDate(metadata, publishedDate) || publishedDate;
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: lead.sourceUrl,
    title: lead.title,
    startDate,
    place: placeFrom(metadata, source),
    time: startDate === publishedDate ? '报道发布日' : '报道所述变动日',
    price: '不适用',
    text: `${lead.category} ${lead.changeType}`,
  });
  return candidate && {
    ...candidate,
    category: lead.category || undefined,
    changeType: lead.changeType,
    dateKind: startDate === publishedDate ? 'published' : 'change',
    attribution: source.name,
  };
}

/**
 * One homepage request, then only the articles whose headline already looks
 * like a shop change. Stale leads are dropped: a shop that opened three months
 * ago is not news the queue can act on.
 */
export async function collectMinkeiShopChanges({ source, fetchImpl = fetch, maxArticles = 12, now = new Date(), maxAgeDays = 45 }) {
  const homepage = await fetchImpl(source.url || source.origin);
  if (!homepage.ok) throw new Error(`${source.name} homepage returned ${homepage.status}`);
  const leads = parseMinkeiHomepage(await homepage.text(), source).slice(0, maxArticles);
  const oldest = new Date(now.getTime() - maxAgeDays * 86400000);
  const events = [];
  for (const lead of leads) {
    const response = await fetchImpl(lead.sourceUrl);
    if (!response.ok) continue;
    const event = parseMinkeiArticle(await response.text(), lead, source);
    if (event && new Date(`${event.startDate}T00:00:00+09:00`) >= oldest) events.push(event);
  }
  return events;
}

/** Flat source entries, one per edition, for the registry and health monitor. */
export const minkeiSources = () => MINKEI_EDITIONS.map((edition) => ({
  ...edition,
  url: `${edition.origin}/`,
  sourceFamily: 'local_media',
  trustTier: 'S2',
  accessMethod: 'html',
  crawlFrequency: 'daily',
  expectedUpdateWindowDays: 14,
  robotsAndTermsCheckedAt: '2026-08-28',
  parserVersion: '2026-08-28',
  ownerOrContact: 'みんなの経済新聞ネットワーク',
  collect: collectMinkeiShopChanges,
}));
