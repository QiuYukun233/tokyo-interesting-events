import { fileURLToPath } from 'node:url';
import { classifyActivity } from '../lib/activity-filter.mjs';
import { openPool, upsertCandidate } from '../lib/pool-db.mjs';
import { shopWhy } from '../lib/shop-publication-policy.mjs';
import { minkeiSources } from './sources/minkei.mjs';

/**
 * Shop-lifecycle collector — みんなの経済新聞 15 地域版.
 *
 * Runs outside the main ingestion because it is a two-stage crawl (one
 * homepage, then only the matching articles) at a much lower frequency than
 * the venue sources.
 *
 * ## Why this was rewritten (2026-08-28)
 *
 * It used to read `data/events.json`, merge its own picks into it and write it
 * back — i.e. a crawl path that published straight to the front page, deciding
 * for itself with a `DISTINCTIVE` keyword regex. That is precisely the路径
 * 决策记录/0003 says must not exist: 「没有任何抓取代码路径能让东西上前台」.
 *
 * In practice it was worse than a rule violation, because `npm run export-site`
 * regenerates `data/events.json` from the pool in full. Everything this script
 * published was silently erased by the next export, so fifteen editions were
 * being crawled, judged and thrown away. That is why the pool held only a
 * handful of 経済新聞 candidates.
 *
 * Now it writes candidates like every other source and rules on nothing. The
 * old `DISTINCTIVE` regex is gone rather than promoted to lib/gate.mjs: 初出店 /
 * 専門店 / ユニーク / コンセプト is a judgement about whether a shop sounds
 * interesting, which 决策记录/0002 reserves for a person. `lib/object-type.mjs`
 * already sorts these into opening / closing / place from `changeType`, which
 * is the part that is factual.
 */
const POOL = new URL('../data/pool.db', import.meta.url);

const sources = minkeiSources();
const settled = await Promise.allSettled(sources.map(({ collect, ...source }) => collect({ source })));
for (const [index, result] of settled.entries()) {
  if (result.status === 'rejected') console.error(`Edition failed: ${sources[index].name} — ${result.reason?.message || result.reason}`);
}
const succeeded = settled.filter((result) => result.status === 'fulfilled');
const collected = succeeded.flatMap((result) => result.value);

const pool = openPool(fileURLToPath(POOL));
const now = new Date();
let stored = 0;
for (const event of collected) {
  if (!event?.id || !event?.startDate) continue;
  upsertCandidate(pool, { ...event, why: shopWhy(event) }, { now, ...classifyActivity(event) });
  stored += 1;
}
pool.close();

const byType = collected.reduce((counts, event) => ({ ...counts, [event.changeType || 'other']: (counts[event.changeType || 'other'] || 0) + 1 }), {});
console.log(`Pooled ${stored} shop candidates from ${succeeded.length}/${sources.length} editions.`);
console.log(`By change type: ${Object.entries(byType).map(([type, count]) => `${type} ${count}`).join(' · ') || 'none'}`);
console.log('All land pending; run `npm run review` to judge them, then `npm run export-site`.');
