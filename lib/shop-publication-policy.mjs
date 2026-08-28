/**
 * Shop-lifecycle copy.
 *
 * This file used to also hold `shopPublicationDecision`, a `DISTINCTIVE`
 * keyword regex (初出店 / 専門店 / ユニーク / コンセプト …) that let the
 * shop-change crawler publish straight to `data/events.json`. Both are gone as
 * of 2026-08-28: the crawler now writes candidates to the pool like every other
 * source, and nothing it finds reaches the front page without a decision row.
 *
 * The regex was deliberately not promoted into `lib/gate.mjs`. Deciding that a
 * shop is 「ユニーク」 or 「コンセプト」 enough to show is a judgement about
 * whether it sounds interesting, which 决策记录/0002 reserves for a person;
 * the gate only acts on facts an organiser or venue declared. What *is*
 * factual — opening, closing, relocation — already reaches the back office
 * through `changeType`, which `lib/object-type.mjs` maps to opening / closing /
 * place.
 */

/** The one-line "why go" shown on a shop card. */
export function shopWhy(event) {
  if (event.changeType === 'closing') return '即将消失的城市记忆，适合在关门前专程去一次';
  if (event.changeType === 'opening') return '东京新出现的店铺形态，适合和朋友一起尝鲜';
  return '老地方正在变成新玩法，具有明确的限时发现感';
}
