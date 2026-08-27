import assert from 'node:assert/strict';
import test from 'node:test';
import { universityPublicationDecision } from './university-publication-policy.mjs';

test('keeps distinctive public university talks', () => {
  assert.equal(universityPublicationDecision({ source: '東京大学', title: '漫画家による文化トークイベント' }).publish, true);
  assert.equal(universityPublicationDecision({ source: '東京大学', title: '都市とまちづくりシンポジウム' }).publish, true);
});

test('routes recruitment, internal, and professional training to review', () => {
  assert.equal(universityPublicationDecision({ source: '東京大学', title: '松尾研AI講座 受講生募集' }).publish, false);
  assert.equal(universityPublicationDecision({ source: '東京大学', title: '令和8年度 研究倫理セミナー' }).publish, false);
  assert.equal(universityPublicationDecision({ source: '東京大学', title: '学生限定 文学講演会' }).publish, false);
});
