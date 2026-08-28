import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from './shop-publication-policy.mjs';
import { shopWhy } from './shop-publication-policy.mjs';

test('the "why go" line matches what makes each change worth a trip', () => {
  assert.match(shopWhy({ changeType: 'closing' }), /関門|关门|消失/);
  assert.match(shopWhy({ changeType: 'opening' }), /新/);
  assert.equal(typeof shopWhy({ changeType: 'discovery' }), 'string');
});

test('a closing reads as a deadline, an opening does not', () => {
  assert.notEqual(shopWhy({ changeType: 'closing' }), shopWhy({ changeType: 'opening' }));
});

test('no publication decision is exported any more', () => {
  // Regression guard for 2026-08-28: the shop crawler used to decide for itself
  // with a DISTINCTIVE keyword regex and write straight into data/events.json,
  // which is the crawl-to-front-page path 决策记录/0003 forbids. Judging a shop
  // "unique enough" is also taste, which 0002 reserves for a person. If this
  // ever comes back, it belongs in lib/gate.mjs with evidence — not here.
  assert.equal(policy.shopPublicationDecision, undefined);
  assert.deepEqual(Object.keys(policy), ['shopWhy']);
});
