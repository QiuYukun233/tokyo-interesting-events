const BIG_SIGHT_INTEREST = /ロボット|ドローン|おもちゃ|玩具|コミック|同人|ゲーム|模型|プラモデル|フィギュア|ペット|動物|爬虫|両生|アニメ|アート|デザイン|クラフト|モビリティ|モーター|スポーツ|アウトドア|フェス|ショー|ハムフェア|アマチュア無線|カメラ|鉄道|恐竜|宇宙|科学|音楽|ライブ|フード/i;

export function publicationDecision(event) {
  if (event?.source !== 'Tokyo Big Sight') return { publish: true, reason: null };
  if (!/一般/.test(event.audience || '')) return { publish: false, reason: 'Tokyo Big Sight: trade-only admission' };
  if (!BIG_SIGHT_INTEREST.test(`${event.title || ''} ${event.description || ''}`)) return { publish: false, reason: 'Tokyo Big Sight: public but lacks an experiential-interest signal' };
  return { publish: true, reason: null };
}

export function applyPublicationPolicy(events = []) {
  const publishable = [];
  const review = [];
  for (const activity of events) {
    const decision = publicationDecision(activity);
    if (decision.publish) publishable.push(activity);
    else review.push({ activity, decision: 'review', reasons: [decision.reason] });
  }
  return { publishable, review };
}
