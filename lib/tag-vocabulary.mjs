/**
 * The closed tag vocabulary for the explore queue.
 *
 * The tagging model may ONLY pick from this list — free-form tags would make
 * the learned per-tag weights meaningless (see docs/探索队列设计.md §2.5).
 * Changing this list means re-tagging the whole pool (scripts/tag-candidates.mjs
 * --retag), which is cheap by design.
 */
export const TAG_VOCABULARY = [
  '深夜', '怪奇', '动手', '免费', '限定', '户外', '亲子', '复古',
  '科技', '传统', '音乐', '演剧', '艺术', '市集', '学术', '自然',
  '动物', '美食', '运动', '铁道', '机械', '地下', '海边', '展览',
  '参与', '安静', '热闹', '小众', '大型', '仪式',
];

const VOCABULARY = new Set(TAG_VOCABULARY);

/** Dedupe, drop anything outside the vocabulary, cap at 5 per candidate. */
export function validTags(tags = []) {
  return [...new Set(tags)].filter((tag) => VOCABULARY.has(tag)).slice(0, 5);
}
