import { readFile, writeFile } from 'node:fs/promises';
import { minkeiSources } from './sources/minkei.mjs';
import { shopPublicationDecision, shopWhy } from '../lib/shop-publication-policy.mjs';

/**
 * Shop-lifecycle collector. Runs outside the main ingestion because it is a
 * two-stage crawl (one homepage, then only the matching articles) at a much
 * lower frequency than the venue sources.
 */
const OUTPUT = new URL('../data/events.json', import.meta.url);
const REVIEW_OUTPUT = new URL('../data/review-events.json', import.meta.url);

/**
 * A shop change being real is not enough to publish it — most openings are an
 * ordinary chain branch. Publication needs something that makes the place worth
 * a trip.
 */
const DISTINCTIVE = /初出店|都内初|日本初|旗艦|専門店|複合|体験|限定|ユニーク|コンセプト|復活|老舗|長年|ディスクユニオン|ホビー|ピックルボール|独立|book|古書|銭湯|レコード|模型|ライブハウス/i;

function publicationDecision(event) {
  // Shibuya keeps its own longer-standing policy; the rest of the network
  // shares one rule until there is evidence to split them.
  if (event.source === 'シブヤ経済新聞') return shopPublicationDecision(event);
  if (event.changeType === 'discovery' || DISTINCTIVE.test(`${event.title || ''} ${event.category || ''}`)) return { publish: true, reason: null };
  return { publish: false, reason: 'Shop change: real but not distinctive enough for automatic publication' };
}

const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00+09:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const sources = minkeiSources();
const settled = await Promise.allSettled(sources.map(({ collect, ...source }) => collect({ source })));
for (const [index, result] of settled.entries()) {
  if (result.status === 'rejected') console.error(`Edition failed: ${sources[index].name} — ${result.reason?.message || result.reason}`);
}
const collected = settled.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value);

const publicEvents = [];
const reviewEntries = [];
for (const event of collected) {
  const decision = publicationDecision(event);
  if (!decision.publish) {
    reviewEntries.push({ activity: event, decision: 'review', reasons: [decision.reason], signals: [] });
    continue;
  }
  const safe = Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'description'));
  publicEvents.push({
    ...safe,
    // A closing is a deadline; an opening stays interesting for a while.
    ...(event.changeType === 'closing' ? {} : { endDate: addDays(event.startDate, 35) }),
    attribution: event.attribution || event.source,
    why: shopWhy(event),
  });
}

const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
const reviewData = JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8'));
const events = [...new Map([...published.events, ...publicEvents].map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()]
  .sort((a, b) => a.startDate.localeCompare(b.startDate));
const review = [...new Map([...reviewData.events, ...reviewEntries].map((entry) => [`${entry.activity?.sourceUrl}:${entry.activity?.title}`, entry])).values()];

await Promise.all([
  writeFile(OUTPUT, `${JSON.stringify({ ...published, events }, null, 2)}\n`),
  writeFile(REVIEW_OUTPUT, `${JSON.stringify({ ...reviewData, events: review }, null, 2)}\n`),
]);
console.log(`Shop changes from ${settled.filter((r) => r.status === 'fulfilled').length}/${sources.length} editions: collected ${collected.length}; published ${publicEvents.length}; review ${reviewEntries.length}.`);
