/**
 * Deterministic editorial filters for Tokyo activity candidates.
 *
 * This module intentionally has no network or model dependency: it is safe to
 * run before enrichment and acts as a conservative first pass.
 */

const HARD_EXCLUSION_PATTERNS = [
  /求人|採用|就職|転職|キャリア|職業説明|職業紹介|合同説明会|会社説明会/i,
  /招聘|求职|招聘会|职业说明|职业介绍|校招|宣讲会/i,
  /採用情報|求人情報|人材募集|リクルート|リクルーティング/i,
  /入試|受験|進学相談|学校説明会|オープンキャンパス.*相談/i,
  /招生|入学说明|升学咨询|考试说明/i,
  /セール|SALE|特売|販売会|即売会|商談会|営業/i,
  /促销|特卖|销售会|商务洽谈|推销/i,
];

// These terms make an otherwise trade-oriented listing plausibly useful as a
// public outing. They do not override an explicit recruitment/sales match.
const PUBLIC_EXPERIENCE_PATTERNS = [
  /ロボット|robot|ドローン|drone|AI|人工知能/i,
  /模型|プラモデル|フィギュア|ゲームショウ|game show|esports/i,
  /アート|美術|展示|展覧会|博物館|科学|science|デザイン/i,
  /体験|ワークショップ|一般公開|一般来場|公開/i,
  /ペット|動物|犬|猫|アウトドア|モビリティ|宇宙/i,
];

const normalizeWhitespace = (value) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** Normalize titles for stable exact comparisons, while preserving Japanese. */
export function normalizeTitle(value) {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("ja-JP")
    .replace(/[「」『』【】［］\[\]（）()〈〉<>《》“”"'']/g, "")
    .replace(/[・･·.,，。:：;；!?！？/\\|｜_\-–—~〜]/g, "")
    .replace(/\s+/g, "");
}

/** Normalize URLs for deterministic exact comparisons. */
export function normalizeUrl(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) url.port = "";
    // Tracking parameters do not identify an activity page.
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return raw.toLowerCase().replace(/\s+/g, "");
  }
}

export function activityText(activity) {
  return [activity?.title, activity?.name, activity?.description, activity?.category, activity?.venue]
    .filter(Boolean)
    .map(normalizeWhitespace)
    .join(" ");
}

/** Return a stable editorial decision and reasons. */
export function classifyActivity(activity = {}) {
  const text = activityText(activity);
  const reasons = HARD_EXCLUSION_PATTERNS.filter((pattern) => pattern.test(text)).map(String);
  const publicExperience = PUBLIC_EXPERIENCE_PATTERNS.some((pattern) => pattern.test(text));
  if (reasons.length) return { eligible: false, decision: "exclude", publicExperience, reasons };
  return { eligible: true, decision: publicExperience ? "keep" : "review", publicExperience, reasons: [] };
}

/**
 * Remove deterministic duplicates, preferring the first candidate. URL is the
 * strongest key; title is used only when no URL is available.
 */
export function dedupeActivities(activities = []) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const kept = [];
  for (const activity of activities) {
    const url = normalizeUrl(activity?.url ?? activity?.sourceUrl);
    const title = normalizeTitle(activity?.title ?? activity?.name);
    if ((url && seenUrls.has(url)) || (!url && title && seenTitles.has(title))) continue;
    if (url) seenUrls.add(url);
    if (title) seenTitles.add(title);
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

