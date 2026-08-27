/**
 * Deterministic first-pass editorial filter for Tokyo activity candidates.
 *
 * Every decision carries machine-readable reason codes. The `review` bucket is
 * NOT a publication gate today (see docs/架构.md); the codes exist so that an
 * automatic gate can later be designed against real distributions instead of
 * against guesses.
 */

/** Hard exclusions: "this is not the kind of thing we are about." Plan §5.1. */
const HARD_EXCLUSION_RULES = [
  { code: 'hard:recruiting', label: '招聘・就活', pattern: /求人|採用|就職|転職|キャリア|職業説明|職業紹介|合同説明会|会社説明会/i },
  { code: 'hard:recruiting', label: '招聘・就活', pattern: /招聘|求职|招聘会|职业说明|职业介绍|校招|宣讲会/i },
  { code: 'hard:recruiting', label: '招聘・就活', pattern: /採用情報|求人情報|人材募集|リクルート|リクルーティング/i },
  { code: 'hard:admissions', label: '招生・升学', pattern: /入試|受験|進学相談|学校説明会|オープンキャンパス.*相談/i },
  { code: 'hard:admissions', label: '招生・升学', pattern: /招生|入学说明|升学咨询|考试说明/i },
  { code: 'hard:trade_sales', label: '纯商谈・销售', pattern: /商談会|営業職|販売員募集|出展者募集|出店者募集|バイヤー向け|仕入れ|代理店募集|セールス研修/i },
  { code: 'hard:trade_sales', label: '纯商谈・销售', pattern: /商务洽谈|销售岗位|销售员招聘|招募展商|采购商|经销商|销售培训/i },
  // Corporate training and business seminars. Added after Doorkeeper's feed
  // showed 「中小企業のためのSNS×AI広報セミナー」 passing as `keep` on the
  // strength of matching signal:tech (AI) — exactly the professional-development
  // content plan §5.1 excludes. Kept narrow: 体験/ワークショップ/公開講座 and
  // 研究会 must survive, so bare セミナー and bare 研修 are deliberately not listed.
  { code: 'hard:business_training', label: '经营・业务研修', pattern: /経営セミナー|ビジネスセミナー|営業セミナー|広報セミナー|集客セミナー|マーケティングセミナー|社員研修|新人研修|管理職研修|中小企業(?:の|向け)/i },
  { code: 'hard:business_training', label: '经营・业务研修', pattern: /经营研修|企业培训|员工培训|管理培训|获客/i },
];

/** Positive signals. Matching one is currently the only route to `keep`. */
const PUBLIC_EXPERIENCE_RULES = [
  { code: 'signal:tech', label: '机器人・无人机・AI', pattern: /ロボット|robot|ドローン|drone|AI|人工知能/i },
  { code: 'signal:hobby', label: '模型・游戏・电竞', pattern: /模型|プラモデル|フィギュア|ゲームショウ|game show|esports/i },
  { code: 'signal:art', label: '艺术・展览・科学', pattern: /アート|美術|展示|展覧会|博物館|科学|science|デザイン/i },
  { code: 'signal:hands_on', label: '体验・工作坊・一般公开', pattern: /体験|ワークショップ|一般公開|一般来場|公開/i },
  { code: 'signal:nature', label: '动物・户外・宇宙', pattern: /ペット|動物|犬|猫|アウトドア|モビリティ|宇宙/i },
];

/** Reason attached when nothing matched — the single largest review bucket. */
export const NO_SIGNAL_CODE = 'review:no_public_experience_signal';

export const REASON_LABELS = Object.fromEntries([
  ...HARD_EXCLUSION_RULES.map(({ code, label }) => [code, label]),
  ...PUBLIC_EXPERIENCE_RULES.map(({ code, label }) => [code, label]),
  [NO_SIGNAL_CODE, '未命中任何公开体验特征'],
  ['review:trade_only_admission', '仅限商谈・非一般来场'],
]);

const normalizeWhitespace = (value) => String(value ?? "")
  .normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export function normalizeTitle(value) {
  return normalizeWhitespace(value).toLocaleLowerCase("ja-JP")
    .replace(/[「」『』【】［］\[\]（）()〈〉<>《》“”"'']/g, "")
    .replace(/[・･·.,，。:：;；!?！？/\\|｜_\-–—~〜]/g, "").replace(/\s+/g, "");
}

export function normalizeUrl(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  try {
    const url = new URL(raw); url.hash = ""; url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort(); url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch { return raw.toLowerCase().replace(/\s+/g, ""); }
}

export function activityText(activity) {
  return [activity?.title, activity?.name, activity?.description, activity?.category, activity?.venue]
    .filter(Boolean).map(normalizeWhitespace).join(" ");
}

function activityDate(activity) {
  const value = activity?.startDate ?? activity?.date ?? activity?.start ?? activity?.eventDate;
  return normalizeWhitespace(value).slice(0, 10);
}

const uniqueCodes = (rules, text) => [...new Set(rules.filter(({ pattern }) => pattern.test(text)).map(({ code }) => code))];

/**
 * @returns {{decision: 'keep'|'review'|'exclude', reasons: string[], signals: string[], ...}}
 *   `reasons` explains the decision and is never empty. `signals` lists the
 *   positive matches, kept separately so a future gate can weigh them.
 */
export function classifyActivity(activity = {}) {
  const text = activityText(activity);
  const exclusions = uniqueCodes(HARD_EXCLUSION_RULES, text);
  const signals = uniqueCodes(PUBLIC_EXPERIENCE_RULES, text);
  if (exclusions.length) {
    return { eligible: false, decision: "exclude", publishable: false, publicExperience: signals.length > 0, reasons: exclusions, signals };
  }
  if (signals.length) {
    return { eligible: true, decision: "keep", publishable: true, publicExperience: true, reasons: signals, signals };
  }
  return { eligible: true, decision: "review", publishable: false, publicExperience: false, reasons: [NO_SIGNAL_CODE], signals: [] };
}

export function dedupeActivities(activities = []) {
  const seenUrls = new Set(); const seenTitleDates = new Set(); const kept = [];
  for (const activity of activities) {
    const url = normalizeUrl(activity?.url ?? activity?.sourceUrl);
    const title = normalizeTitle(activity?.title ?? activity?.name);
    const date = activityDate(activity); const titleDate = title && date ? `${title}|${date}` : "";
    if ((url && seenUrls.has(url)) || (titleDate && seenTitleDates.has(titleDate)) || (!url && !date && title && seenTitleDates.has(`${title}|`))) continue;
    if (url) seenUrls.add(url);
    seenTitleDates.add(titleDate || `${title}|`);
    kept.push(activity);
  }
  return kept;
}

export function filterAndDedupeActivities(activities = []) {
  const decisions = activities.map((activity) => ({ activity, ...classifyActivity(activity) }));
  return {
    excluded: decisions.filter(({ decision }) => decision === "exclude"),
    review: decisions.filter(({ decision }) => decision === "review"),
    activities: dedupeActivities(decisions.filter(({ decision }) => decision !== "exclude").map(({ activity }) => activity)),
  };
}
