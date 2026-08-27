import { createHash } from 'node:crypto';

export const EVENT_KEYWORDS = ['イベント', '開催', '展', '祭', '公演', 'ライブ', '上映', '体験', '観察会', 'マーケット', 'フェス'];
export const COLORS = ['#3d66f5', '#ef5b3f', '#d6a72d', '#6c59c8'];
export const SYMBOLS = ['◒', '✦', '●', '♪'];

export function dateFrom(text = '') {
  const match = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
}

export function vibeFor(text = '') {
  if (/美術|芸術|舞台|展示|映画|上映/.test(text)) return '艺术现场';
  if (/音楽|ライブ|公演|フェス/.test(text)) return '小众音乐';
  if (/交流|勉強会|トーク|講座/.test(text)) return '好好聊天';
  return '奇妙体验';
}

export function stableEventId(sourceName, sourceUrl, title) {
  return createHash('sha1').update(`${sourceName}:${sourceUrl || title}`).digest('hex').slice(0, 12);
}

export function createEventCandidate({ sourceName, sourceUrl, title, startDate, endDate, place = '东京都内 · 详见主办方', time = '详见活动页', price = '详见活动页', text = '', visualIndex = 0 }) {
  if (!sourceName || !title || !startDate) return null;
  return { id: stableEventId(sourceName, sourceUrl, title), startDate, ...(endDate ? { endDate } : {}), title, titleZh: title, place, time, price, vibe: vibeFor(`${title} ${text}`), color: COLORS[visualIndex % COLORS.length], symbol: SYMBOLS[visualIndex % SYMBOLS.length], mates: 0, sourceUrl, source: sourceName };
}

export function hasEventKeyword(text = '') {
  return EVENT_KEYWORDS.some((word) => text.includes(word));
}

export function mergeAndSelectEvents({ manual, fetched, existing, now, limit = 30, horizonDays = 180 }) {
  const cutoff = new Date(now.getTime() + horizonDays * 86400000);
  return [...new Map([...manual, ...fetched, ...existing].map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()]
    .filter((event) => {
      const date = new Date(`${event.endDate || event.startDate}T23:59:59+09:00`);
      return date >= now && date <= cutoff;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, limit);
}
