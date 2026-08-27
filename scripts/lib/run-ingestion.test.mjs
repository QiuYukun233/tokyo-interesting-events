import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSourcePages } from './run-ingestion.mjs';

test('fetchSourcePages combines configured pages and parses each once', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.endsWith('/robots.txt')) return { status: 404, ok: false, text: async () => '' };
    requested.push(href);
    return { ok: true, status: 200, text: async () => href };
  };
  const source = {
    name: 'Paged source',
    url: 'https://example.com/events?page=1',
    urls: ['https://example.com/events?page=1', 'https://example.com/events?page=2'],
    origin: 'https://example.com',
    parse: (html) => [{ title: html }],
  };
  const events = await fetchSourcePages(source, fetchImpl);
  assert.deepEqual(requested, source.urls);
  assert.deepEqual(events.map((event) => event.title), source.urls);
});
