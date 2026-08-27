import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationDecision } from './publication-policy.mjs';

test('publishes experiential public Big Sight events', () => {
  assert.equal(publicationDecision({ source: 'Tokyo Big Sight', audience: '商談/一般', title: 'TOKYOおもちゃショー' }).publish, true);
  assert.equal(publicationDecision({ source: 'Tokyo Big Sight', audience: '一般', title: 'ペットロボット展' }).publish, true);
});

test('routes trade-only and generic business-like public events to review', () => {
  assert.equal(publicationDecision({ source: 'Tokyo Big Sight', audience: '商談', title: '国際宝飾展' }).publish, false);
  assert.equal(publicationDecision({ source: 'Tokyo Big Sight', audience: '一般', title: '日経・東証IRフェア2026' }).publish, false);
});
