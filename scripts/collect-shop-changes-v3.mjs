import { readFile, writeFile } from 'node:fs/promises';
import { collectShibuyaKeizaiShopChanges, SHIBUYA_KEIZAI_HOME_URL } from './sources/shibuya-keizai-shop-changes-v1.mjs';
import { collectIkebukuroKeizaiShopChanges, IKEBUKURO_KEIZAI_HOME_URL } from './sources/ikebukuro-keizai-shop-changes-v3.mjs';
import { shopPublicationDecision, shopWhy } from '../lib/shop-publication-policy.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const REVIEW_OUTPUT = new URL('../data/review-events.json', import.meta.url);
const DISTINCTIVE_IKEBUKURO = /初出店|都内初|日本初|旗艦|専門店|複合|体験|限定|ユニーク|コンセプト|復活|老舗|長年|ディスクユニオン|ホビー|ピックルボール/i;
const sources = [
  { name: 'シブヤ経済新聞', url: SHIBUYA_KEIZAI_HOME_URL, collect: collectShibuyaKeizaiShopChanges },
  { name: '池袋経済新聞', url: IKEBUKURO_KEIZAI_HOME_URL, collect: collectIkebukuroKeizaiShopChanges },
];

function publicationDecision(event) {
  if (event.source !== '池袋経済新聞') return shopPublicationDecision(event);
  if (event.changeType === 'discovery' || DISTINCTIVE_IKEBUKURO.test(`${event.title || ''} ${event.category || ''}`)) return { publish: true, reason: null };
  return { publish: false, reason: 'Shop change: real but not distinctive enough for automatic publication' };
}

const collected = (await Promise.all(sources.map(({ collect, ...source }) => collect({ source })))).flat();
const addDays = (date, days) => { const value = new Date(`${date}T12:00:00+09:00`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const publicEvents = [];
const reviewEntries = [];
for (const event of collected) {
  const decision = publicationDecision(event);
  if (!decision.publish) { reviewEntries.push({ activity: event, decision: 'review', reasons: [decision.reason] }); continue; }
  const safe = Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'description'));
  publicEvents.push({ ...safe, ...(event.changeType === 'closing' ? {} : { endDate: addDays(event.startDate, 35) }), attribution: event.attribution || event.source, why: shopWhy(event) });
}
const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
const reviewData = JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8'));
const events = [...new Map([...published.events, ...publicEvents].map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
const review = [...new Map([...reviewData.events, ...reviewEntries].map((entry) => [`${entry.activity?.sourceUrl}:${entry.activity?.title}`, entry])).values()];
await Promise.all([writeFile(OUTPUT, `${JSON.stringify({ ...published, events }, null, 2)}\n`), writeFile(REVIEW_OUTPUT, `${JSON.stringify({ ...reviewData, events: review }, null, 2)}\n`)]);
console.log(`Shop changes collected ${collected.length}; published ${publicEvents.length}; review ${reviewEntries.length}.`);
