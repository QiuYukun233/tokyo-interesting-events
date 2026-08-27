import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const OUTPUT = new URL('data/events.json', ROOT);
const MANUAL = new URL('data/manual-events.json', ROOT);
const SOURCES = [
  { name: 'My TOKYO', url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', kind: 'my-tokyo-list' },
];
const KEYWORDS = ['イベント', '開催', '展', '祭', '公演', 'ライブ', '上映', '体験', '観察会', 'マーケット', 'フェス'];
const COLORS = ['#3d66f5', '#ef5b3f', '#d6a72d', '#6c59c8'];
const SYMBOLS = ['◒', '✦', '●', '♪'];

function clean(value = '') {
  return value.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

function field(xml, name) {
  return clean(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '');
}

function dateFrom(text) {
  const match = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function vibeFor(text) {
  if (/美術|芸術|舞台|展示|映画|上映/.test(text)) return '艺术现场';
  if (/音楽|ライブ|公演|フェス/.test(text)) return '小众音乐';
  if (/交流|勉強会|トーク|講座/.test(text)) return '好好聊天';
  return '奇妙体验';
}

function parseFeed(xml, sourceName) {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].flatMap((match, index) => {
    const raw = match[1];
    const title = field(raw, 'title');
    const description = field(raw, 'description');
    const startDate = dateFrom(`${title} ${description}`);
    if (!startDate || !KEYWORDS.some((word) => `${title} ${description}`.includes(word))) return [];
    const sourceUrl = field(raw, 'link');
    const id = createHash('sha1').update(`${sourceName}:${sourceUrl || title}`).digest('hex').slice(0, 12);
    return [{ id, startDate, title, titleZh: title, place: '东京都内 · 详见主办方', time: '详见活动页', price: '详见活动页', vibe: vibeFor(`${title} ${description}`), color: COLORS[index % COLORS.length], symbol: SYMBOLS[index % SYMBOLS.length], mates: 0, sourceUrl, source: sourceName }];
  });
}

function parseMyTokyo(html, sourceName) {
  return [...html.matchAll(/<li class="widget-event-result_list-item">([\s\S]*?)<\/li>/gi)].flatMap((match, index) => {
    const card = match[1];
    const title = clean(card.match(/class="card-event_title">([\s\S]*?)<\/div>/i)?.[1]);
    const href = card.match(/class="card-event_inner" href="([^"]+)"/i)?.[1];
    const place = clean(card.match(/class="card-event_meta-area">([\s\S]*?)<\/div>/i)?.[1]) || '东京都内';
    const period = clean(card.match(/class="card-event_meta-period">([\s\S]*?)<\/div>/i)?.[1]);
    const startDate = dateFrom(period);
    if (!title || !href || !startDate) return [];
    const sourceUrl = new URL(href, 'https://www.my.metro.tokyo.lg.jp').href;
    const id = createHash('sha1').update(`${sourceName}:${sourceUrl}`).digest('hex').slice(0, 12);
    return [{ id, startDate, title, titleZh: title, place, time: period || '详见活动页', price: '详见活动页', vibe: vibeFor(`${title} ${card}`), color: COLORS[index % COLORS.length], symbol: SYMBOLS[index % SYMBOLS.length], mates: 0, sourceUrl, source: sourceName }];
  });
}

async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() + 180 * 86400000);
  const fetched = [];
  for (const source of SOURCES) {
    const response = await fetch(source.url, { headers: { 'user-agent': 'TokyoInterestingEvents/0.1 (+contact via repository)' } });
    if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
    const body = await response.text();
    fetched.push(...(source.kind === 'my-tokyo-list' ? parseMyTokyo(body, source.name) : parseFeed(body, source.name)));
  }
  const manual = JSON.parse(await readFile(MANUAL, 'utf8')).events;
  const existing = JSON.parse(await readFile(OUTPUT, 'utf8')).events;
  const candidates = [...manual, ...fetched, ...existing];
  const unique = [...new Map(candidates.map((event) => [`${event.sourceUrl}:${event.title}`, event])).values()]
    .filter((event) => { const date = new Date(`${event.endDate || event.startDate}T23:59:59+09:00`); return date >= now && date <= cutoff; })
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 30);
  const tokyoNow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', dateStyle: 'short', timeStyle: 'medium' }).format(now).replace(' ', 'T') + '+09:00';
  const updatedAtLabel = `今日 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
  await writeFile(OUTPUT, `${JSON.stringify({ updatedAt: tokyoNow, updatedAtLabel, events: unique }, null, 2)}\n`);
  console.log(`Updated ${unique.length} events from ${SOURCES.length} source(s).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
