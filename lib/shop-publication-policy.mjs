const DISTINCTIVE = /新業態|初出店|都内初|日本初|旗艦|専門店|複合|体験|限定|ユニーク|コンセプト|復活|老舗|長年|西武渋谷|CINEQUINTO|SPACE PART/i;

export function shopPublicationDecision(event) {
  if (event?.source !== 'シブヤ経済新聞') return { publish: true, reason: null };
  const text = `${event.title || ''} ${event.description || ''}`;
  if (event.changeType === 'discovery' || DISTINCTIVE.test(text)) return { publish: true, reason: null };
  return { publish: false, reason: 'Shop change: real but not yet distinctive enough for automatic publication' };
}

export function shopWhy(event) {
  if (event.changeType === 'closing') return '即将消失的城市记忆，适合在关门前专程去一次';
  if (event.changeType === 'opening') return '东京新出现的店铺形态，适合和朋友一起尝鲜';
  return '老地方正在变成新玩法，具有明确的限时发现感';
}
