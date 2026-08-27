import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const SHIBUYA_KEIZAI_HOME_URL = 'https://www.shibukei.com/';

const OPENING = /オープン|出店|開業|新店|開設|リニューアル/;
const CLOSING = /閉店|閉業|営業終了|撤退/;
const DISCOVERY = /ポップアップ|限定店|新業態|復活/;

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
  return description.match(/(渋谷区[^、。)）]*)/)?.[1] || '涩谷区内 · 详见报道';
}

/** Extract only shop-change leads from the robots-permitted public homepage. */
export function parseShibuyaKeizaiHomepage(html, source) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const leads = [];
  $('#topBox a[href*="/headline/"]').each((_, node) => {
    const link = $(node);
    const sourceUrl = link.attr('href');
    if (!sourceUrl || seen.has(sourceUrl)) return;
    const title = compact(link.find('h2, h3, h4').first().text());
    const changeType = changeTypeFor(title);
    if (!title || !changeType) return;
    seen.add(sourceUrl);
    leads.push({
      title,
      sourceUrl: new URL(sourceUrl, source.url || SHIBUYA_KEIZAI_HOME_URL).href,
      changeType,
      category: compact(link.find('span').first().text()),
    });
  });
  return leads;
}

/** Enrich a permitted individual news page; keeps only its short metadata description. */
export function parseShibuyaKeizaiArticle(html, lead, source) {
  const $ = cheerio.load(html);
  const description = compact($('meta[name="description"]').attr('content') || '');
  const publishedDate = isoDate(compact($('time').first().text()));
  if (!description || !publishedDate) return null;
  const startDate = describedChangeDate(description, publishedDate) || publishedDate;
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: lead.sourceUrl,
    title: lead.title,
    startDate,
    place: placeFrom(description),
    time: startDate === publishedDate ? '报道发布日' : '报道所述变动日',
    price: '不适用',
    text: `${description} ${lead.category}`,
    visualIndex: 0,
  });
  return candidate && {
    ...candidate,
    description: description.slice(0, 180),
    category: lead.category || undefined,
    changeType: lead.changeType,
    dateKind: startDate === publishedDate ? 'published' : 'change',
  };
}

/** Low-frequency collector: one homepage request then only matching individual articles. */
export async function collectShibuyaKeizaiShopChanges({ source, fetchImpl = fetch, maxArticles = 8 }) {
  const homepage = await fetchImpl(source.url || SHIBUYA_KEIZAI_HOME_URL);
  if (!homepage.ok) throw new Error(`${source.name} homepage returned ${homepage.status}`);
  const leads = parseShibuyaKeizaiHomepage(await homepage.text(), source).slice(0, maxArticles);
  const events = [];
  for (const lead of leads) {
    const response = await fetchImpl(lead.sourceUrl);
    if (!response.ok) continue;
    const event = parseShibuyaKeizaiArticle(await response.text(), lead, source);
    if (event) events.push(event);
  }
  return events;
}
