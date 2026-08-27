/** Deterministic first-pass editorial filter for Tokyo activity candidates. */
const HARD_EXCLUSION_PATTERNS = [
  /求人|採用|就職|転職|キャリア|職業説明|職業紹介|合同説明会|会社説明会/i,
  /招聘|求职|招聘会|职业说明|职业介绍|校招|宣讲会/i,
  /採用情報|求人情報|人材募集|リクルート|リクルーティング/i,
  /入試|受験|進学相談|学校説明会|オープンキャンパス.*相談/i,
  /招生|入学说明|升学咨询|考试说明/i,
  /商談会|営業職|販売員募集|出展者募集|出店者募集|バイヤー向け|仕入れ|代理店募集|セールス研修/i,
  /商务洽谈|销售岗位|销售员招聘|招募展商|采购商|经销商|销售培训/i,
];

const PUBLIC_EXPERIENCE_PATTERNS = [
  /ロボット|robot|ドローン|drone|AI|人工知能/i,
  /模型|プラモデル|フィギュア|ゲームショウ|game show|esports/i,
  /アート|美術|展示|展覧会|博物館|科学|science|デザイン/i,
  /体験|ワークショップ|一般公開|一般来場|公開/i,
  /ペット|動物|犬|猫|アウトドア|モビリティ|宇宙/i,
];

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

export function classifyActivity(activity = {}) {
  const text = activityText(activity);
  const reasons = HARD_EXCLUSION_PATTERNS.filter((pattern) => pattern.test(text)).map(String);
  const publicExperience = PUBLIC_EXPERIENCE_PATTERNS.some((pattern) => pattern.test(text));
  if (reasons.length) return { eligible: false, decision: "exclude", publishable: false, publicExperience, reasons };
  const decision = publicExperience ? "keep" : "review";
  return { eligible: true, decision, publishable: decision === "keep", publicExperience, reasons: [] };
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
