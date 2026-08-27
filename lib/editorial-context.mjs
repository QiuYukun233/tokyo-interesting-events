export function whyForEvent(event) {
  if (event.why) return event.why;
  const text = `${event.title || ''} ${event.description || ''}`;
  if (event.source === '東京都美術館') return '上野正在发生的正式展览，适合作为一次有明确主题的朋友出行';
  if (event.source === '東京大学') return '大学向公众开放的少见话题，提供普通商业活动没有的讨论密度';
  if (event.source === 'Tokyo Big Sight' && /おもちゃ|玩具/.test(text)) return '大规模玩具现场与一般公开日，适合多人一起逛和互相种草';
  if (event.source === 'Tokyo Big Sight') return '大型公众现场，内容密度高，适合朋友分头探索再交换发现';
  if (/観察|生きもの|バッタ/.test(text)) return '城市里不常见的自然观察体验，活动本身就能避免尬聊';
  if (/ドローン|特別演出|限定/.test(text)) return '具有明确时间窗口和现场感，错过后很难用普通周末替代';
  return '官方公开、近期可去，而且比常规吃饭逛街更容易形成共同记忆';
}
