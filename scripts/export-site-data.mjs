#!/usr/bin/env node
/**
 * Export the pool into the two JSON files the site builds against.
 *
 *   data/events.json     — only what has been decided `published`. The front page.
 *   data/backstage.json  — the whole pool, grouped by object type. The /backstage page.
 *
 * The database is the record; these are derived views. That is what keeps the
 * site a static build while the pool lives in SQL: nothing at build time needs
 * to open a database.
 *
 * Publication is a decision, never a side effect of crawling — so re-running
 * the crawl cannot put something on the front page, and re-running this export
 * cannot either. Only a row in `decisions` can.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listCandidates, openPool, poolSummary } from '../lib/pool-db.mjs';
import { OBJECT_TYPES, OBJECT_TYPE_LABELS } from '../lib/object-type.mjs';

const ROOT = new URL('../', import.meta.url);
const POOL = new URL('data/pool.db', ROOT);
const EVENTS = new URL('data/events.json', ROOT);
const BACKSTAGE = new URL('data/backstage.json', ROOT);
const REGISTRY = new URL('data/source-registry.json', ROOT);

/** Published events are capped so the front page cannot grow without bound. */
const PUBLISHED_LIMIT = 300;
const HORIZON_DAYS = 180;

/** Only the fields the site renders; the pool's bookkeeping stays behind. */
const SITE_FIELDS = [
  'id', 'startDate', 'endDate', 'title', 'titleZh', 'place', 'time', 'price',
  'vibe', 'color', 'symbol', 'sourceUrl', 'source', 'category', 'audience',
  'why', 'changeType', 'attribution', 'imageUrl', 'objectType', 'popularity',
];

const forSite = (row) => Object.fromEntries(
  SITE_FIELDS.filter((field) => row[field] !== null && row[field] !== undefined).map((field) => [field, row[field]]),
);

const readJson = (url, fallback) => readFile(url, 'utf8').then(JSON.parse).catch((error) => {
  if (error.code === 'ENOENT') return fallback;
  throw error;
});

const now = new Date();
const pool = openPool(fileURLToPath(POOL));

const published = listCandidates(pool, { state: 'published', horizonDays: HORIZON_DAYS, now })
  .slice(0, PUBLISHED_LIMIT)
  .map(forSite);

const everything = listCandidates(pool, { horizonDays: HORIZON_DAYS, now });
const summary = poolSummary(pool);
const registry = await readJson(REGISTRY, { entries: [] });

const tokyoNow = `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T')}+09:00`;
const updatedAtLabel = `今日 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
const sourceStatus = (registry.entries || []).map((entry) => ({
  name: entry.name, ok: entry.failureStreak === 0, count: entry.lastItemCount, error: entry.lastError || undefined,
}));

/** Group for the back office, keeping the plan's declared type order. */
const groups = OBJECT_TYPES.map((objectType) => ({
  objectType,
  label: OBJECT_TYPE_LABELS[objectType],
  items: everything.filter((row) => row.objectType === objectType).map((row) => ({
    ...forSite(row),
    state: row.state,
    decidedBy: row.decidedBy || null,
    reasons: row.reasons,
    signals: row.signals,
    firstSeenAt: row.firstSeenAt,
  })),
})).filter((group) => group.items.length);

await Promise.all([
  writeFile(EVENTS, `${JSON.stringify({ updatedAt: tokyoNow, updatedAtLabel, sourceStatus, events: published }, null, 2)}\n`),
  writeFile(BACKSTAGE, `${JSON.stringify({ updatedAt: tokyoNow, summary, groups }, null, 2)}\n`),
]);
pool.close();

console.log(`Exported ${published.length} published events and ${everything.length} pool candidates.`);
console.log(`Pool: ${summary.pending} pending · ${summary.published} published · ${summary.rejected} rejected.`);
