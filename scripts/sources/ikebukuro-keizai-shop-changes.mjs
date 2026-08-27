import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const IKEBUKURO_KEIZAI_HOME_URL = 'https://ikebukuro.keizai.biz/';
const OPENING = /オープン|出店|開業|開設/;
const CLOSING = /閉店|閉業|営業終了|撤退/;
const DISCOVERY = /リニューアル|移転|新業態|ポップアップ|限定店|復活/;
const NOT_A_SHOP_CHANGE = /周年記念|記念企画|フェア|セール|販売|イベント|キャンペーン|大会|祭|盆踊り/;
function compact(value = '') { return value.replace(/\s+/g, ' ').trim(); }
function changeTypeFor(text) {
  if (CLOSING.test(text)) return 'closing';
  if (NOT_A_SHOP_CHANGE.test(text)) return null;
  if (OPENING.test(text)) return 'opening';
  if (DISCOVERY.test(text)) return 'discovery';
  return null;
}
function isoDate(value = '') { const m = value.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; }
function describedChangeDate(description, publishedDate) { const m = description.match(/(\d{1,2})月\s*(\d{1,2})日/); if (!m || !publishedDate) return null; const p = new Date(`${publishedDate}T00:00:00+09:00`); let year = p.getFullYear(); const month = Number(m[1]); if (p.getMonth() + 1 === 12 && month === 1) year += 1; return `${year}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
function placeFrom(description) { return description.match(/((?:豊島区|板橋区|北区|練馬区)[^、。)）]*)/)?.[1] || '池袋周边 · 详见报道'; }

export function parseIkebukuroKeizaiHomepage(html, source) {
  const $ = cheerio.load(html); const seen = new Set(); const leads = [];
  $('a[href*="/headline/"]').each((_, node) => { const link = $(node); const href = link.attr('href'); if (!href || seen.has(href)) return; const title = compact(link.find('h2, h3, h4').first().text()); const changeType = changeTypeFor(title); if (!title || !changeType) return; seen.add(href); leads.push({ title, changeType, category: compact(link.find('span').first().text()), sourceUrl: new URL(href, source.url || IKEBUKURO_KEIZAI_HOME_URL).href }); });
  return leads;
}

/** Metadata is used only to derive facts; no article summary is retained. */
export function parseIkebukuroKeizaiArticle(html, lead, source) {
  const $ = cheerio.load(html); const metadata = compact($('meta[name="description"]').attr('content') || ''); const publishedDate = isoDate(compact($('time').first().text())); if (!publishedDate) return null;
  const startDate = describedChangeDate(metadata, publishedDate) || publishedDate;
  const candidate = createEventCandidate({ sourceName: source.name, sourceUrl: lead.sourceUrl, title: lead.title, startDate, place: placeFrom(metadata), time: startDate === publishedDate ? '报道发布日' : '报道所述变动日', price: '不适用', text: `${lead.category} ${lead.changeType}`, visualIndex: 0 });
  return candidate && { ...candidate, category: lead.category || undefined, changeType: lead.changeType, dateKind: startDate === publishedDate ? 'published' : 'change', attribution: source.name };
}

export async function collectIkebukuroKeizaiShopChanges({ source, fetchImpl = fetch, maxArticles = 12, now = new Date(), maxAgeDays = 45 }) {
  const homepage = await fetchImpl(source.url || IKEBUKURO_KEIZAI_HOME_URL); if (!homepage.ok) throw new Error(`${source.name} homepage returned ${homepage.status}`); const leads = parseIkebukuroKeizaiHomepage(await homepage.text(), source).slice(0, maxArticles); const events = []; const oldest = new Date(now.getTime() - maxAgeDays * 86400000);
  for (const lead of leads) { const response = await fetchImpl(lead.sourceUrl); if (!response.ok) continue; const event = parseIkebukuroKeizaiArticle(await response.text(), lead, source); if (event && new Date(`${event.startDate}T00:00:00+09:00`) >= oldest) events.push(event); }
  return events;
}
