import test from 'node:test';
import assert from 'node:assert/strict';
import { tagPrompt, parseTagResponse } from './tagging.mjs';

const candidates = [
  { id: 'c1', title: '深夜の怪談ライブ', category: '演芸', place: '新宿', description: '真夜中に始まる怪談トーク' },
  { id: 'c2', title: '陶芸体験教室', category: null, place: null, description: null },
];

test('the prompt carries every candidate id and the closed vocabulary', () => {
  const prompt = tagPrompt(candidates, ['深夜', '怪奇', '动手']);
  assert.ok(prompt.includes('c1') && prompt.includes('c2'));
  assert.ok(prompt.includes('深夜の怪談ライブ'));
  assert.ok(prompt.includes('深夜') && prompt.includes('动手'));
});

test('parseTagResponse keeps only known ids and vocabulary tags', () => {
  const text = '{"c1": ["深夜", "怪奇", "编造的"], "c2": ["动手"], "ghost": ["深夜"]}';
  const result = parseTagResponse(text, ['c1', 'c2'], ['深夜', '怪奇', '动手']);
  assert.deepEqual(result.get('c1'), ['深夜', '怪奇']);
  assert.deepEqual(result.get('c2'), ['动手']);
  assert.equal(result.has('ghost'), false);
});

test('a response wrapped in prose or fences still parses', () => {
  const text = '好的，结果如下：\n```json\n{"c1": ["深夜"]}\n```';
  assert.deepEqual(parseTagResponse(text, ['c1'], ['深夜']).get('c1'), ['深夜']);
});

test('garbage raises instead of silently tagging nothing', () => {
  assert.throws(() => parseTagResponse('no json here', ['c1'], ['深夜']));
});
