const UNIVERSITY_INTEREST = /文化|歴史|文学|漫画|アート|芸術|音楽|映画|科学|宇宙|ロボット|AI|都市|まちづくり|建築|環境|生物|考古|哲学|社会|政治|トーク|シンポジウム|講演|一般公開|公開講座|祭|見学|体験/i;
const UNIVERSITY_BLOCK = /受講生募集|履修者募集|入試|進学|オープンキャンパス.*相談|キャリア|就職|採用|研究倫理|コンプライアンス|学内限定|学生限定|教職員限定/i;

export function universityPublicationDecision(event) {
  if (event?.source !== '東京大学') return { publish: true, reason: null };
  const text = `${event.title || ''} ${event.description || ''} ${event.audience || ''}`;
  if (UNIVERSITY_BLOCK.test(text)) return { publish: false, reason: 'University: recruitment, internal, or professional-training content' };
  if (!UNIVERSITY_INTEREST.test(text)) return { publish: false, reason: 'University: lacks a public cultural or exploratory signal' };
  return { publish: true, reason: null };
}

export function applyUniversityPublicationPolicy(events = []) {
  const publishable = [];
  const review = [];
  for (const activity of events) {
    const decision = universityPublicationDecision(activity);
    if (decision.publish) publishable.push(activity);
    else review.push({ activity, decision: 'review', reasons: [decision.reason] });
  }
  return { publishable, review };
}
