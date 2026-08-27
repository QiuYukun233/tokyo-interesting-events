/**
 * The gate: rules that decide without a human.
 *
 * This is the structural half of "candidates wait in the back office". A rule
 * writes the same `decisions` row a person does, differing only in `decidedBy`
 * (`rule:<name>` instead of `human`), so turning a category over to automation
 * later changes an author, not a schema.
 *
 * The bar for adding a rule is deliberately high, and it is not "the filter is
 * usually right". A rule belongs here only when the evidence is **factual and
 * authoritative** — the organiser's own declaration of who may attend, a date
 * that has passed — never a judgement about whether something is interesting.
 * Taste stays with a person until `lib/gate-evidence.mjs` shows a code actually
 * agrees with human decisions at a useful sample size.
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

/** Rules are tried in order; the first match decides. */
export const RULES = [tradeOnly];

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
