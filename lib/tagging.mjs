import { validTags } from './tag-vocabulary.mjs';

/**
 * Prompt/response plumbing for batch tagging, kept pure so it is testable
 * without the API. The model may only pick from the closed vocabulary;
 * anything else is dropped at parse time, not trusted at prompt time.
 */
export function tagPrompt(candidates, vocabulary) {
  const list = candidates.map((c) => [
    `- id: ${c.id}`,
    `  标题: ${c.title}`,
    c.category ? `  类别: ${c.category}` : null,
    c.place ? `  地点: ${c.place}` : null,
    c.description ? `  描述: ${c.description}` : null,
  ].filter(Boolean).join('\n')).join('\n');
  return [
    '你在为一个东京活动发现站给候选打标签。词表是封闭的，只能从下面选，每条 1-5 个，宁缺毋滥：',
    vocabulary.join('、'),
    '',
    '候选：',
    list,
    '',
    '只输出一个 JSON 对象，键是候选 id，值是标签数组。不要输出其他任何文字。',
  ].join('\n');
}

/** Extract the JSON object from a possibly prose-wrapped reply and sanitise it. */
export function parseTagResponse(text, ids, vocabulary) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`no JSON object in model reply: ${String(text).slice(0, 120)}`);
  const parsed = JSON.parse(match[0]);
  const known = new Set(ids);
  const allowed = new Set(vocabulary);
  const result = new Map();
  for (const [id, tags] of Object.entries(parsed)) {
    if (!known.has(id) || !Array.isArray(tags)) continue;
    const clean = validTags(tags).filter((tag) => allowed.has(tag));
    result.set(id, clean);
  }
  return result;
}
