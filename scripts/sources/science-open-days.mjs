import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

export const AIST_ORIGIN = 'https://www.aist.go.jp';
export const JST_ORIGIN = 'https://www.jst.go.jp';

const compact = (value = '') => String(value).replace(/[\s\u3000]+/g, ' ').trim();
const iso = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Annual pages are normally published in summer. Early in a new year, keep
// reading the previous edition instead of turning an expected unpublished page
// into a daily source-health failure.
export function editionYear(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric',
  }).formatToParts(now).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  return Number(parts.month) >= 6 ? Number(parts.year) : Number(parts.year) - 1;
}

export const aistOpenDayUrl = (now = new Date()) =>
  `${AIST_ORIGIN}/aist_j/information/research_bases/waterfront/news/exhibition${editionYear(now)}.html`;
export const scienceAgoraUrl = (now = new Date()) =>
  `${JST_ORIGIN}/sis/scienceagora/${editionYear(now)}/index.html`;

export function eventDateRange(value = '') {
  const text = compact(value);
  const match = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日[^\d]{0,12}(?:・|、|〜|～|-)\s*(?:(\d{1,2})月)?\s*(\d{1,2})日/);
  if (!match) return null;
  return {
    startDate: iso(match[1], match[2], match[3]),
    endDate: iso(match[1], match[4] || match[2], match[5]),
  };
}

function topicSummary(text, topics) {
  const found = topics.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
  return found.length ? `官方页面明确列出的现场内容包括：${found.slice(0, 5).join('、')}。` : null;
}

export function parseAistOpenDay(html, source = {}) {
  const $ = cheerio.load(html);
  const text = compact($('main').text() || $('body').text());
  const title = text.match(/産総研臨海副都心センター\s*一般公開\d{4}/)?.[0];
  const range = eventDateRange(text);
  if (!title || !range || !/どなたでも参加OK|入場料[：:]?\s*無料/.test(text)) return [];

  const candidate = createEventCandidate({
    sourceName: source.name || '産総研・臨海副都心センター',
    sourceUrl: source.url || aistOpenDayUrl(),
    title,
    ...range,
    place: '产总研临海副都心中心 · 青海',
    time: '10:00–16:00（以官方页面为准）',
    price: '免费',
    text: '研究设施公众开放 科技 机器人 体验',
  });
  if (!candidate) return [];
  return [{
    ...candidate,
    category: '研究设施公众开放',
    changeType: 'special_access',
    description: topicSummary(text, [
      [/つながる工場/, '人与机器协作工厂'],
      [/ミニマルファブ/, '微型半导体工厂'],
      [/移動ロボット/, '移动机器人远程操作'],
      [/モーションキャプチャー/, '下一代动作捕捉'],
    ]) || '一年一度进入研究设施、观看实验室与技术演示的公众开放日。',
  }];
}

export function parseScienceAgora(html, source = {}) {
  const $ = cheerio.load(html);
  const text = compact($('main').text() || $('body').text());
  const title = (text + ' ' + compact($('title').text())).match(/サイエンスアゴラ\s*\d{4}/)?.[0];
  const timeDates = [...new Set($('time[datetime]').map((_, element) =>
    compact($(element).attr('datetime')).slice(0, 10)).get().filter((date) => /^20\d{2}-\d{2}-\d{2}$/.test(date)))].sort();
  const range = timeDates.length >= 2
    ? { startDate: timeDates[0], endDate: timeDates[timeDates.length - 1] }
    : eventDateRange(text);
  if (!title || !range || !/事前登録は不要|入場料\s*無料/.test(text)) return [];

  const candidate = createEventCandidate({
    sourceName: source.name || 'サイエンスアゴラ',
    sourceUrl: source.url || scienceAgoraUrl(),
    title,
    ...range,
    place: 'Telecom Center Building等 · 台场',
    time: '首日10:00–18:00／次日10:00–17:00',
    price: '免费（一部分材料费除外）',
    text: '参与式科学节 科技 体验',
  });
  if (!candidate) return [];
  return [{
    ...candidate,
    category: '参与式科学节',
    description: topicSummary(text, [
      [/植物の感覚/, '植物感知研究'],
      [/3Dプリンタ/, '3D打印辅助器具'],
      [/超音波.{0,30}浮遊/, '超声悬浮'],
      [/量子センサー/, '量子传感器'],
      [/JAXA/, 'JAXA航空体验'],
    ]) || '面向公众的参与式科学节，可在现场接触研究者与实验展示。',
  }];
}


