import test from 'node:test';
import assert from 'node:assert/strict';
import { TAG_VOCABULARY, validTags } from './tag-vocabulary.mjs';

test('the vocabulary is a closed set of 20-40 short tags with no duplicates', () => {
  assert.ok(TAG_VOCABULARY.length >= 20 && TAG_VOCABULARY.length <= 40);
  assert.equal(new Set(TAG_VOCABULARY).size, TAG_VOCABULARY.length);
  for (const tag of TAG_VOCABULARY) assert.ok(tag.length >= 2 && tag.length <= 4, tag);
});

test('validTags keeps only vocabulary tags, deduped, capped at 5', () => {
  assert.deepEqual(validTags(['深夜', '深夜', '自由发挥', '怪奇']), ['深夜', '怪奇']);
  assert.deepEqual(validTags(['not-a-tag']), []);
  assert.equal(validTags(TAG_VOCABULARY.slice(0, 8)).length, 5);
  assert.deepEqual(validTags(undefined), []);
});
