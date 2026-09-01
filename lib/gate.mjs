/**
 * The gate: rules that decide without a human.
 *
 * This is the structural half of "candidates wait in the back office". A rule
 * writes the same `decisions` row a person does, differing only in `decidedBy`
 * (`rule:<name>` instead of `human`), so turning a category over to automation
 * later changes an author, not a schema.
 *
 * The bar for adding a rule is deliberately high, and it is not "the filter is
 * usually right". Two kinds of evidence clear that bar:
 *
 *   1. An organiser's own declared field (来場対象者, an admission audience).
 *   2. A structural fact about the CONTENT ITSELF — not whether it sounds
 *      interesting, but whether it is a "go somewhere and do/see a thing" at
 *      all. A call asking the reader to mail in a photo, a numbered newsletter
 *      digest, a ticket on-sale notice: none of these describe a destination,
 *      whatever their subject matter. `lib/activity-filter.mjs`'s
 *      `hard:submission_call` / `hard:bulletin` / `hard:on_sale_announcement`
 *      codes exist for exactly this, and this file trusts them.
 *
 * What never qualifies is a judgement about whether the thing is *interesting*
 * — an academic lecture versus a hands-on workshop, an industrial trade show
 * versus a consumer one, whether five sessions of the same series are worth
 * showing back to back. Those decisions came out of a 2026-08-28 human/AI
 * review pass (see 决策记录/0003 附录) and are exactly what stays with a person
 * until `lib/gate-evidence.mjs` shows a code actually agrees with human
 * decisions at a useful sample size — a first pass is not that evidence yet.
 *
 * A rule never overturns a decision that already exists: `applyGate` only ever
 * rules on pending candidates.
 *
 * Pure functions; the caller does the writing.
 */

/**
 * Big Sight publishes 来場対象者 as one of 商談 / 一般 / 商談・一般. `商談` alone
 * means the public cannot register at all — plan §5.2's first condition for
 * keeping a trade show ("普通人可以合法报名或购买入场") fails outright.
 *
 * Note this is narrower than the old crawl-time heuristic, which pushed every
 * trade-flavoured show aside. A show that admits both audiences stays pending
 * for a person to look at, because plan §5.2 is explicit that 商談展 can be
 * worth going to.
 */
const tradeOnly = {
  name: 'trade_only_admission',
  state: 'rejected',
  reason: '主办方声明仅限商谈，一般人无法入场（方案 §5.2 第 1 条）',
  matches: (candidate) => candidate.audience === '商談',
};

/**
 * Codes from `lib/activity-filter.mjs` that mean "this post has no destination
 * to describe", not "this destination sounds boring". Kept as its own set
 * rather than folded into HARD_EXCLUSION generally, so a future addition to
 * the filter's hard-exclusion list does not silently start auto-rejecting
 * from the pool without a deliberate decision here.
 */
const NOT_A_DESTINATION_CODES = new Set([
  'hard:submission_call', 'hard:bulletin', 'hard:on_sale_announcement',
  // A funeral-goods retailer is a shop you visit for a death in the family.
  // The evidence is its own declared category (「仏壇仏具販売」), not a guess
  // about whether it sounds interesting — and every one a person has looked at
  // was rejected. Added 2026-08-30 on a sample of three, which is thin; if a
  // 仏具 workshop ever turns up that is genuinely worth visiting, this is the
  // line to reconsider.
  'hard:funeral_supplies',
  // Job fairs, company briefings, admission/school-info sessions: errands, not
  // outings. Added 2026-09-01 after the explore queue surfaced them to a human
  // and every one came back 不想去 (plus 4/4 earlier human rejections on
  // hard:recruiting). Only the verdict-grade codes are trusted — the broad
  // hard:recruiting pattern stays evidence-only because 「採用した」 trips it
  // on a leather workshop's belt mechanism.
  'hard:career_event',
  'hard:admissions',
]);

const notADestination = {
  name: 'not_a_destination',
  state: 'rejected',
  reason: '内容本身不是可去处（征稿/简报/开售公告/就活・招生活动），与是否有趣无关',
  matches: (candidate) => (candidate.reasons || []).some((code) => NOT_A_DESTINATION_CODES.has(code)),
};

/**
 * 産業貿易センター records a 公開区分 per booking: 公開 / 招待 / 関係者のみ.
 * The latter two mean the hall itself says you cannot walk in — an invitation-
 * only reception or a staff-only setup. That is the same kind of evidence as
 * Big Sight's 来場対象者: the venue's own record of who may attend, not a guess
 * about whether the event sounds worthwhile.
 *
 * A row with no badge at all stays pending. Absence is not a declaration, and
 * the safe reading of "unstated" is "someone should look", not "closed".
 */
const NOT_OPEN_ADMISSION = new Set(['招待', '関係者のみ']);

const notOpenToPublic = {
  name: 'not_open_to_public',
  state: 'rejected',
  reason: '场馆记录该场次为招待制／仅限关系者，一般人无法入场（方案 §5.2 第 1 条）',
  matches: (candidate) => NOT_OPEN_ADMISSION.has(candidate.audience),
};

/** Rules are tried in order; the first match decides. */
export const RULES = [tradeOnly, notADestination, notOpenToPublic];

/**
 * Ask the gate about one candidate.
 * @returns {{state: string, decidedBy: string, reason: string}|null} null = leave pending
 */
export function gateDecision(candidate, rules = RULES) {
  if (!candidate || candidate.state !== 'pending') return null;
  for (const rule of rules) {
    if (rule.matches(candidate)) return { state: rule.state, decidedBy: `rule:${rule.name}`, reason: rule.reason };
  }
  return null;
}

/**
 * Run the gate over a pool listing.
 * @returns {Array<{id: string, state: string, decidedBy: string, reason: string}>}
 */
export function applyGate(candidates = [], rules = RULES) {
  const decisions = [];
  for (const candidate of candidates) {
    const decision = gateDecision(candidate, rules);
    if (decision) decisions.push({ id: candidate.id, ...decision });
  }
  return decisions;
}
