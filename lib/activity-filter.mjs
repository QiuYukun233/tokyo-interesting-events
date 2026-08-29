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
  // Not a destination at all: a call asking the reader to submit something,
  // never a place-and-time to go. Added after a first human/AI review pass of
  // My TOKYO's government bulletin feed (2026-08-28) — see 决策记录/0003 附录.
  // Scoped to named submission types so it cannot catch a workshop's own
  // 参加者募集 wording (signing up to attend is not submitting content).
  { code: 'hard:submission_call', label: '征稿・征集', pattern: /(写真|川柳|俳句|短歌|作品|エッセイ|標語|イラスト|レシピ).{0,10}(募集|投稿)/i },
  { code: 'hard:submission_call', label: '征稿・征集', pattern: /(照片|征文|作品|俳句|短歌|插画|标语|食谱).{0,10}(征集|征稿)/i },
  // A digest post bundling several unrelated mini-events or a numbered
  // recurring newsletter — the post itself has no single date/place/activity.
  { code: 'hard:bulletin', label: '汇总简报', pattern: /からのお知らせ\s*Vol\.?\s*\d+|\d+月の(?:イベント情報|お知らせ)/i },
  // A retail/ticket on-sale announcement, not something to attend.
  { code: 'hard:on_sale_announcement', label: '开售公告', pattern: /を発売します|パスを発売|グッズを発売/i },
  // Funeral goods. 仏壇仏具店 reads to an outsider like a craft shop — lacquer,
  // gold leaf, joinery — and そのため they turn up in craft-fair rosters. In
  // Japan they are funeral suppliers: you go when someone has died. Three of
  // three were rejected on sight in the 2026-08-29 review pass.
  //
  // 石材 is deliberately NOT in this pattern: 昭和石材工業所 is a stonemason
  // opening its workshop for おおたオープンファクトリー, which is exactly the
  // kind of candidate this project exists for.
  { code: 'hard:funeral_supplies', label: '佛坛佛具・丧葬用品', pattern: /仏壇|仏具|佛壇|佛具|葬儀|葬祭|葬具|霊園|墓石/ },
];

/** Positive signals. Matching one is currently the only route to `keep`. */
const PUBLIC_EXPERIENCE_RULES = [
  { code: 'signal:tech', label: '机器人・无人机・AI', pattern: /ロボット|robot|ドローン|drone|AI|人工知能/i },
  { code: 'signal:hobby', label: '模型・游戏・电竞', pattern: /模型|プラモデル|フィギュア|ゲームショウ|game show|esports/i },
  { code: 'signal:art', label: '艺术・展览・科学', pattern: /アート|美術|展示|展覧会|博物館|科学|science|デザイン/i },
  { code: 'signal:hands_on', label: '体验・工作坊・一般公开', pattern: /体験|ワークショップ|一般公開|一般来場|公開/i },
  { code: 'signal:nature', label: '动物・户外・宇宙', pattern: /ペット|動物|犬|猫|アウトドア|モビリティ|宇宙/i },
  // Theatre/musical titles rarely carry any of the keywords above — added
  // after CoRich's real data showed 380/386 candidates falling into the
  // NO_SIGNAL_CODE bucket purely for lack of a matching word, not for lack
  // of interest. Broad on purpose: mainstream musicals sit next to rakugo,
  // Noh and sword-fighting theatre, which is exactly the long-tail this
  // source exists for.
  { code: 'signal:theater', label: '戏剧・音乐剧・传统艺能', pattern: /舞台|演劇|ミュージカル|落語|能楽|狂言|歌舞伎|芝居|オペラ|朗読劇/i },
  // Two more categories that never hit any pattern above — same failure
  // shape as signal:theater before it: real, judged-worthy content silently
  // landing in NO_SIGNAL_CODE for lack of a matching word, not for lack of interest.
  { code: 'signal:escape_room', label: '密室逃脱・解谜游戏', pattern: /脱出ゲーム|謎解き|リアル脱出|ナゾトキ/i },
  { code: 'signal:comedy', label: '相声・漫才・喜剧', pattern: /お笑い|漫才|コント|寄席/i },
];

/**
 * Signals read from the **address**, not from the title.
 *
 * A shop's address quietly says whether it is street-facing or tucked away.
 * 「東京都港区高輪4-23-4-304」 is a jeweller in a flat; 「蔵前1-7-10 マツリビル 2F」
 * is a workshop up a staircase. Of the 317 places in the pool on 2026-08-29,
 * 131 carry one of these shapes — the "weird little shop upstairs in a
 * residential block" the discovery queue wants is already in the data, just
 * never labelled.
 *
 * **These never make a candidate publishable.** Being upstairs says nothing
 * about whether a place is worth going to, and 决策记录/0002 keeps that kind of
 * judgement with a person. They are recorded in `signals` so the queue and
 * lib/gate-evidence.mjs can use them; the keep/review decision is made by
 * PUBLIC_EXPERIENCE_RULES alone.
 */
const PLACE_SHAPE_RULES = [
  // 2F and above, or a basement — anything that is not the ground floor.
  // `1F`/`1階` deliberately does not match.
  { code: 'signal:off_street', label: '不在街面（楼上或地下）', pattern: /(?:^|[^0-9])(?:[2-9]|[1-9][0-9])\s*(?:F|階)|地下|B1F?|BF/i },
  // A room number: 「…4-23-4-304」 or 「…302号室」.
  { code: 'signal:residential_room', label: '住宅楼中的一室', pattern: /-\d{3,4}(?:号|号室)?$|\d{3,4}号室/ },
  // The address names a building rather than just a street number. This is a
  // word list, so カタカナ building names it does not know — 中野ブロードウェイ,
  // for one — slip past. Left narrow on purpose: widening it until it matches
  // every name would make the code mean "has an address".
  { code: 'signal:in_building', label: '在某栋楼里', pattern: /(ビル|マンション|ハイツ|コーポ|荘|館|レジデンス|パレス|プラザ)/ },
];

/** Reason attached when nothing matched — the single largest review bucket. */
export const NO_SIGNAL_CODE = 'review:no_public_experience_signal';

export const REASON_LABELS = Object.fromEntries([
  ...HARD_EXCLUSION_RULES.map(({ code, label }) => [code, label]),
  ...PUBLIC_EXPERIENCE_RULES.map(({ code, label }) => [code, label]),
  ...PLACE_SHAPE_RULES.map(({ code, label }) => [code, label]),
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
/** Address-shape signals for one candidate; empty when it has no `place`. */
export function placeSignals(activity = {}) {
  return uniqueCodes(PLACE_SHAPE_RULES, normalizeWhitespace(activity?.place));
}

export function classifyActivity(activity = {}) {
  const text = activityText(activity);
  const exclusions = uniqueCodes(HARD_EXCLUSION_RULES, text);
  const experience = uniqueCodes(PUBLIC_EXPERIENCE_RULES, text);
  // Address shape is recorded but never decides: see PLACE_SHAPE_RULES.
  const signals = [...experience, ...placeSignals(activity)];
  if (exclusions.length) {
    return { eligible: false, decision: "exclude", publishable: false, publicExperience: experience.length > 0, reasons: exclusions, signals };
  }
  if (experience.length) {
    return { eligible: true, decision: "keep", publishable: true, publicExperience: true, reasons: experience, signals };
  }
  return { eligible: true, decision: "review", publishable: false, publicExperience: false, reasons: [NO_SIGNAL_CODE], signals };
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
