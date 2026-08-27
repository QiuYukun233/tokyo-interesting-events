import { readFile, writeFile } from 'node:fs/promises';
import { collectShibuyaKeizaiShopChanges, SHIBUYA_KEIZAI_HOME_URL } from './sources/shibuya-keizai-shop-changes-v1.mjs';
import { shopPublicationDecision, shopWhy } from '../lib/shop-publication-policy.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const REVIEW_OUTPUT = new URL('../data/review-events.json', import.meta.url);
const source = { name: 'シブヤ経済新聞', url: SHIBUYA_KEIZAI_HOME_URL };
const collected = await collectShibuyaKeizaiShopChanges({ source });
const addDays = (date, days) => { const value = new Date(`${date}T12:00:00+09:00`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const publicEvents = [];
const reviewEntries = [];
for (const event of collected) {
  const decision = shopPublicationDecision(event);
  if (!decision.publish) { reviewEntries.push({ activity: event, decision: 'review', reasons: [decision.reason] }); continue; }
  const safe = Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'description'));
  publicEvents.push({ ...safe, ...(event.changeType === 'closing' ? {} : { endDate: addDays(event.startDate, 35) }), attribution: 'シブヤ経済新聞', why: shopWhy(event) });
}
const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
const reviewData = JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8'));
const events = [...new Map([...published.events, ...publicEvents].map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
const review = [...new Map([...reviewData.events, ...reviewEntries].map((entry) => [`${entry.activity?.sourceUrl}:${entry.activity?.title}`, entry])).values()];
await Promise.all([writeFile(OUTPUT, `${JSON.stringify({ ...published, events }, null, 2)}\n`), writeFile(REVIEW_OUTPUT, `${JSON.stringify({ ...reviewData, events: review }, null, 2)}\n`)]);
console.log(`Shop changes collected ${collected.length}; published ${publicEvents.length}; review ${reviewEntries.length}.`);
