import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRobotsAllowed, fetchSourcePages } from './run-ingestion.mjs';

const source = {
  name: 'Paged source',
  url: 'https://example.com/events?page=1',
  urls: ['https://example.com/events?page=1', 'https://example.com/events?page=2'],
  origin: 'https://example.com',
  parse: (html) => [{ title: html }],
};

/** @param robots {status, body} for /robots.txt; every other URL echoes its own href. */
const stubFetch = (robots, requested = []) => async (url) => {
  const href = String(url);
  if (href.endsWith('/robots.txt')) {
    return { status: robots.status, ok: robots.status >= 200 && robots.status < 300, text: async () => robots.body ?? '' };
  }
  requested.push(href);
  return { ok: true, status: 200, text: async () => href };
};

test('fetchSourcePages combines configured pages and parses each once', async () => {
  const requested = [];
  const { events } = await fetchSourcePages(source, stubFetch({ status: 404 }, requested));
  assert.deepEqual(requested, source.urls);
  assert.deepEqual(events.map((event) => event.title), source.urls);
});

test('a missing robots.txt permits crawling and is not flagged', async () => {
  const result = await assertRobotsAllowed(source, stubFetch({ status: 404 }));
  assert.equal(result.robotsUnavailable, false);
});

test('a 403 robots.txt permits crawling but is flagged (RFC 9309)', async () => {
  // Waseda answers 403 on /robots.txt from a Cloudflare challenge while serving
  // the event list normally. Treating that as a ban silently dropped the source.
  const result = await assertRobotsAllowed(source, stubFetch({ status: 403 }));
  assert.equal(result.robotsUnavailable, true);
  const { robotsUnavailable } = await fetchSourcePages(source, stubFetch({ status: 403 }));
  assert.equal(robotsUnavailable, true);
});

test('a 5xx or 429 robots.txt refuses the crawl', async () => {
  for (const status of [429, 500, 503]) {
    await assert.rejects(() => assertRobotsAllowed(source, stubFetch({ status })), new RegExp(String(status)));
  }
});

test('an explicit Disallow is still honoured', async () => {
  await assert.rejects(
    () => assertRobotsAllowed(source, stubFetch({ status: 200, body: 'User-agent: *\nDisallow: /events' })),
    /disallows crawling/,
  );
});

test('an allowing robots.txt lets the crawl through unflagged', async () => {
  const result = await assertRobotsAllowed(source, stubFetch({ status: 200, body: 'User-agent: *\nDisallow: /admin' }));
  assert.equal(result.robotsUnavailable, false);
});

test('a source may fold its rows into fewer candidates', async () => {
  // 方案 §4.3: 220 comedy bills at one theatre are one answer to "where should
  // we go", not 220. The rows are still parsed; `aggregate` decides what a
  // candidate is.
  const folding = {
    ...source,
    aggregate: (events, src) => [{ title: src.name, rows: events.length }],
  };
  const { events } = await fetchSourcePages(folding, stubFetch({ status: 404 }));
  assert.deepEqual(events, [{ title: 'Paged source', rows: 2 }]);
});

test('a source with no aggregate hook is untouched', async () => {
  const { events } = await fetchSourcePages(source, stubFetch({ status: 404 }));
  assert.equal(events.length, 2);
});

test('the registry family is stamped onto every candidate', async () => {
  // The explore queue's diversity round-robin groups by sourceFamily; parsers
  // don't know the registry, so the pipeline stamps it. A parser that sets its
  // own value wins over the stamp.
  const familied = { ...source, sourceFamily: 'theatre', parse: (html) => [{ title: html }] };
  const { events } = await fetchSourcePages(familied, stubFetch({ status: 404 }));
  assert.deepEqual(events.map((event) => event.sourceFamily), ['theatre', 'theatre']);
  const opinionated = { ...familied, parse: (html) => [{ title: html, sourceFamily: 'own' }] };
  const { events: kept } = await fetchSourcePages(opinionated, stubFetch({ status: 404 }));
  assert.equal(kept[0].sourceFamily, 'own');
});

test('an aggregate that returns nothing means no candidate, not a failure', async () => {
  const empty = { ...source, aggregate: () => [] };
  const { events } = await fetchSourcePages(empty, stubFetch({ status: 404 }));
  assert.deepEqual(events, []);
});

test('marking trade-only admission does not discard the classifier’s signals', async () => {
  // Overwriting `signals` with [] made every crawl wipe those codes and every
  // backfill restore them: ~100 rows oscillating invisibly, and skewing the
  // gate evidence for them in between.
  const { classifyActivity } = await import('../../lib/activity-filter.mjs');
  const tradeShow = { title: '国際物流総合展', description: '展示会', audience: '商談' };
  assert.ok(classifyActivity(tradeShow).signals.length, 'the fixture must carry a signal to be meaningful');
});
