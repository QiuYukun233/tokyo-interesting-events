import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const IKEBUKURO_KEIZAI_HOME_URL = 'https://ikebukuro.keizai.biz/';

const OPENING = /オープン|出店|開業|開設/;
const CLOSING = /閉店|閉業|営業終了|撤退/;
const DISCOVERY = /リニューアル|移転|新業態|ポップアップ|限定店|復活/;

function compact(value = '') { return value.replace(/\s+/g, ' ').trim(); }

function changeTypeFor(text) {
  if (CLOSING.test(text)) return 'closing';
  if (OPENING.test(text)) return 'opening';
  if (DISCOVERY.test(text)) return 'discovery';
  return null;
}

function isoDate(value = '') {
  const match = value.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

function describedChangeDate(description, publishedDate) {
  const match = description.match(/(\d{1,2})月\s*(\d{1,2})日/);
  if (!match || !publishedDate) return null;
  const published = new Date(`${publishedDate}T00:00:00+09:00`);
  let year = published.getFullYear();
  const month = Number(match[1]);
  if (published.getMonth() + 1 === 12 && month === 1) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function placeFrom(description) {
  return description.match(/((?:豊島区|板橋区|北区|練馬区)[^、。)）]*)/)?.[1] || '池袋周边 · 详见报道';
}

/** Homepage-only lead extraction; the site's robots policy prohibits its RSS feed. */
export function parseIkebukuroKeizaiHomepage(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const leads = [];
  $('#topBox a[href*="/headline/"]').each((_, node) => {
    const link = $(node);
    const href = link.attr('href');
    if (!href || seen.has(href)) return;
    const title = compact(link.find('h2, h3, h4').first().text());
    const changeType = changeTypeFor(title);
    if (!title || !changeType) return;
    seen.add(href);
    leads.push({ title, changeType, category: compact(link.find('span').first().text()), sourceUrl: new URL(href, source.url || IKEBUKURO_KEIZAI_HOME_URL).href });
  });
  return leads;
}

/** Enrich factual date/place only; never retain or publish an article summary. */
export function parseIkebukuroKeizaiArticle(html, lead, source) {
  const $ = cheerio.load(html);
  const metadataDescription = compact($('meta[name="description"]').attr('content') || '');
  const publishedDate = isoDate(compact($('time').first().text()));
  if (!publishedDate) return null;
  const startDate = describedChangeDate(metadataDescription, publishedDate) || publishedDate;
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: lead.sourceUrl,
    title: lead.title,
    startDate,
    place: placeFrom(metadataDescription),
    time: startDate === publishedDate ? '报道发布日' : '报道所述变动日',
    price: '不适用',
    text: `${lead.category} ${lead.changeType}`,
    visualIndex: 0,
  });
  return candidate && { ...candidate, category: lead.category || undefined, changeType: lead.changeType, dateKind: startDate === publishedDate ? 'published' : 'change', attribution: source.name };
}

export async function collectIkebukuroKeizaiShopChanges({ source, fetchImpl = fetch, maxArticles = 8 }) {
  const homepage = await fetchImpl(source.url || IKEBUKURO_KEIZAI_HOME_URL);
  if (!homepage.ok) throw new Error(`${source.name} homepage returned ${homepage.status}`);
  const leads = parseIkebukuroKeizaiHomepage(await homepage.text(), source).slice(0, maxArticles);
  const events = [];
  for (const lead of leads) {
    const response = await fetchImpl(lead.sourceUrl);
    if (!response.ok) continue;
    const event = parseIkebukuroKeizaiArticle(await response.text(), lead, source);
    if (event) events.push(event);
  }
  return events;
}
