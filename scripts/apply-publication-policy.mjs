import { readFile, writeFile } from 'node:fs/promises';
import { applyPublicationPolicy } from '../lib/publication-policy.mjs';

const ROOT = new URL('../', import.meta.url);
const OUTPUT = new URL('data/events.json', ROOT);
const REVIEW_OUTPUT = new URL('data/review-events.json', ROOT);

const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
const reviewData = JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8'));
const result = applyPublicationPolicy(published.events);
const combinedReview = [...reviewData.events, ...result.review];
const uniqueReview = [...new Map(combinedReview.map((entry) => [`${entry.activity?.sourceUrl}:${entry.activity?.title}`, entry])).values()];

await Promise.all([
  writeFile(OUTPUT, `${JSON.stringify({ ...published, events: result.publishable }, null, 2)}\n`),
  writeFile(REVIEW_OUTPUT, `${JSON.stringify({ ...reviewData, events: uniqueReview }, null, 2)}\n`),
]);
console.log(`Publication policy kept ${result.publishable.length}; moved ${result.review.length} to review.`);
