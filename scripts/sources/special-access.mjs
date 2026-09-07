import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';
import { parseJapaneseRange } from './tokyo-park-events.mjs';

export const IRI_TOKYO_OPEN_DAY_URL = 'https://www.iri-tokyo.jp/news/openday2026-honbu/';
export const IRI_TOKYO_ORIGIN = 'https://www.iri-tokyo.jp';
export const TMPC_ROAD_TOUR_URL = 'https://www.tmpc.or.jp/06_info/dourokengaku/';
export const TMPC_ORIGIN = 'https://www.tmpc.or.jp';
export const BUNKYO_NARUSE_URL = 'https://www.city.bunkyo.lg.jp/b047/p007677.html';
export const BUNKYO_ORIGIN = 'https://www.city.bunkyo.lg.jp';
export const HAMA_RIKYU_NIGHT_URL = 'https://www.tokyo-park.or.jp/park/hama-rikyu/news/2026/park_info_29.html';

const compact = (value = '') => String(value).normalize('NFKC').replace(/[\s\u3000]+/g, ' ').trim();
const iso = (year, month, day) => String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');

function singleJapaneseDate(text) {
  const match = compact(text).match(/(?:(20\d{2})年|令和\s*(\d+)年)\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  return iso(match[1] || Number(match[2]) + 2018, match[3], match[4]);
}

export function parseIriTokyoOpenDay(html, source = {}) {
  const $ = cheerio.load(html);
  const text = compact($('main').text() || $('body').text());
  const title = compact($('h1').first().text());
  const startDate = singleJapaneseDate(text.match(/開催日時.{0,90}/)?.[0] || text);
  if (!/本部一般公開20\d{2}/.test(title) || !startDate || !/当日参加も可能/.test(text) || !/参加費\s*\|?\s*無料/.test(text)) return [];
  const candidate = createEventCandidate({
    sourceName: source.name || '東京都立産業技術研究センター', sourceUrl: source.url || IRI_TOKYO_OPEN_DAY_URL,
    title, startDate, place: '东京都立产业技术研究中心本部 · 青海',
    time: '10:00–16:30（最终入场16:00）', price: '免费（可当天参加；部分项目名额有限）',
    text: '平时不能进入的实验室 机器人 3D打印 电子显微镜 IoT 体验',
  });
  return candidate ? [{ ...candidate, category: '研究设施公众开放', changeType: 'special_access', description: '可走进平时不开放的实验室，看金属3D打印与扫描电子显微镜，并体验服务机器人和IoT展示。' }] : [];
}

export function parseTmpcRoadTour(html, source = {}) {
  const $ = cheerio.load(html);
  const heading = $('h2').filter((_, node) => compact($(node).text()) === '参加者募集').first();
  if (!heading.length) return [];
  const scope = heading.parent().text().length < 1000 ? heading.parent() : heading.nextAll().slice(0, 4);
  const text = compact(scope.text());
  const title = text.match(/「([^」]+見学ツアー)」の参加者を募集/)?.[1];
  const startDate = singleJapaneseDate(text);
  const link = scope.find('a').filter((_, node) => /申込|お申込み/.test(compact($(node).text()))).first();
  if (!title || !startDate || !link.length || /当選通知|実施報告/.test(title)) return [];
  const candidate = createEventCandidate({
    sourceName: source.name || '東京都道路整備保全公社', sourceUrl: new URL(link.attr('href'), source.origin || TMPC_ORIGIN).href,
    title, startDate, place: '两国站集合 → 隅田川桥梁群与复兴纪念馆',
    time: '13:00–16:15（报名截至9月18日16:00）', price: '免费 · 20人抽选',
    text: '通常难以参观 道路设施 桥梁 城市基础设施 见学',
  });
  return candidate ? [{ ...candidate, category: '城市基础设施见学', changeType: 'special_access', description: '沿隅田川步行观察桥梁，并进入复兴纪念馆；这是道路公社面向公众开放的限额见学。' }] : [];
}

export function parseBunkyoNaruse(html, source = {}) {
  const $ = cheerio.load(html);
  const text = compact($('#tmp_contents').text() || $('main').text() || $('body').text());
  const pageTitle = compact($('#tmp_contents h1, main h1, h1').first().text());
  const title = pageTitle.match(/「([^」]*成瀬記念講堂[^」]*)」の特別公開/)?.[1] || '日本女子大学成瀬記念講堂 内部特別公開';
  const startDate = singleJapaneseDate(text.match(/日時.{0,80}/)?.[0] || text);
  if (!startDate || !/通常非公開/.test(text) || !/特別(?:に)?公開/.test(text) || !/申込締切.{0,30}9月27日/.test(text)) return [];
  const candidate = createEventCandidate({
    sourceName: source.name || '文京区教育委員会', sourceUrl: source.url || BUNKYO_NARUSE_URL,
    title, startDate, place: '日本女子大学 成濑纪念讲堂 · 目白台',
    time: '11:00／13:30（各回约1小时；报名截至9月27日）', price: '免费 · 各回20人抽选',
    text: '1906年 洋风讲堂 建筑 通常非公开 内部 特别开放',
  });
  return candidate ? [{ ...candidate, category: '通常非公开建筑', changeType: 'special_access', description: '1906年建成、被指定为文京区有形文化财的洋风讲堂，仅在这次活动中开放内部。' }] : [];
}

export function parseHamaRikyuNight(html, source = {}) {
  const $ = cheerio.load(html);
  const text = compact($('main').text() || $('body').text());
  if (!/浜離宮でお月見散歩/.test(text) || !/夜間の開園時間延長/.test(text) || !/通常の入園料のみ/.test(text)) return [];
  const definitions = [
    { title: '浜离宫月夜散步：在将军庭园赏栗名月', pattern: /令和\s*8年\s*10\s*月\s*21\s*日[^～〜~]{0,20}[～〜~]\s*23\s*日/, rangeText: '令和8年10月21日～23日', fragment: '#moon-viewing', description: '园路与树木只做微光照明，配合笛、筝、尺八等传统演出；21日还会临时开放平常禁止进入的草地举行供月仪式。' },
    { title: '浜离宫开园80周年：夜之御庭漫步', pattern: /令和\s*8年\s*10\s*月\s*30\s*日[^～〜~]{0,20}[～〜~]\s*11\s*月\s*3\s*日/, rangeText: '令和8年10月30日～11月3日', fragment: '#80th-night-garden', description: '用光与影重做浜离宫的夜景，并开放夜间茶屋菜单；是都立庭园开园80周年限定的五个夜晚。' },
  ];
  return definitions.flatMap((item, index) => {
    if (!item.pattern.test(text)) return [];
    const candidate = createEventCandidate({
      sourceName: source.name || '東京都公園協会 · 浜離宮恩賜庭園', sourceUrl: (source.url || HAMA_RIKYU_NIGHT_URL) + item.fragment,
      title: item.title, ...parseJapaneseRange(item.rangeText), place: '浜离宫恩赐庭园 · 汐留',
      time: '日落后–21:00（最终入园20:30）', price: '仅需通常入园费',
      text: '夜间特别开放 月夜 将军庭园 传统艺能 灯光 茶屋', visualIndex: index,
    });
    return candidate ? [{ ...candidate, category: '庭园夜间特别开放', changeType: 'special_access', description: item.description }] : [];
  });
}



