import assert from 'node:assert/strict';
import test from 'node:test';
import { whyForEvent } from './editorial-context.mjs';

test('keeps source-specific and experience-specific editorial reasons', () => {
  assert.match(whyForEvent({ source: '東京都美術館', title: '企画展' }), /上野/);
  assert.match(whyForEvent({ source: 'My TOKYO', title: '夜の生きもの観察会' }), /自然観察/);
  assert.match(whyForEvent({ source: 'Tokyo Big Sight', title: 'おもちゃショー' }), /玩具/);
});

test('preserves a manually supplied shop reason', () => {
  assert.equal(whyForEvent({ why: '关门前最后去一次', title: '老店闭店' }), '关门前最后去一次');
});
