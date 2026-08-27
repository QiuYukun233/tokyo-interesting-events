import { readFile, writeFile } from 'node:fs/promises';
import { applyUniversityPublicationPolicy } from '../lib/university-publication-policy.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const REVIEW_OUTPUT = new URL('../data/review-events.json', import.meta.url);
const published = JSON.parse(await readFile(OUTPUT, 'utf8'));
const reviewData = JSON.parse(await readFile(REVIEW_OUTPUT, 'utf8'));
const result = applyUniversityPublicationPolicy(published.events);
const combined = [...reviewData.events, ...result.review];
const review = [...new Map(combined.map((entry) => [`${entry.activity?.sourceUrl}:${entry.activity?.title}`, entry])).values()];
await Promise.all([
  writeFile(OUTPUT, `${JSON.stringify({ ...published, events: result.publishable }, null, 2)}\n`),
  writeFile(REVIEW_OUTPUT, `${JSON.stringify({ ...reviewData, events: review }, null, 2)}\n`),
]);
console.log(`University policy kept ${result.publishable.length}; moved ${result.review.length} to review.`);
