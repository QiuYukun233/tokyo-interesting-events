import assert from 'node:assert/strict';
import test from 'node:test';
import { shopPublicationDecision } from './shop-publication-policy.mjs';

test('publishes distinctive openings, closings, and new formats', () => {
  assert.equal(shopPublicationDecision({ source: 'シブヤ経済新聞', changeType: 'closing', title: '西武渋谷店が閉店' }).publish, true);
  assert.equal(shopPublicationDecision({ source: 'シブヤ経済新聞', changeType: 'discovery', title: '映画館が新業態へ' }).publish, true);
});

test('routes generic shop churn to review', () => {
  assert.equal(shopPublicationDecision({ source: 'シブヤ経済新聞', changeType: 'opening', title: 'ラーメン店がオープン' }).publish, false);
  assert.equal(shopPublicationDecision({ source: 'シブヤ経済新聞', changeType: 'closing', title: 'チェーンカフェが閉店' }).publish, false);
});
