import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';
import { parseTokyoBigSight, TOKYO_BIG_SIGHT_URL } from './tokyo-big-sight.mjs';
import { parseUTokyoEvents, UTOKYO_EVENTS_URL } from './utokyo-events.mjs';
import { parseTokyoMetropolitanArtMuseum, TOKYO_METROPOLITAN_ART_MUSEUM_URL } from './tokyo-metropolitan-art-museum.mjs';
import { parseGeidaiMuseum } from './geidai-museum.mjs';
import { parseWasedaEvents, WASEDA_EVENTS_URL } from './waseda-events.mjs';
import { parseShibuyaParcoEvents, SHIBUYA_PARCO_EVENTS_URL } from './shibuya-parco-events.mjs';

export const SOURCES = [
  { name: 'My TOKYO', url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', origin: 'https://www.my.metro.tokyo.lg.jp', parse: parseMyTokyo },
  { name: 'Tokyo Big Sight', url: TOKYO_BIG_SIGHT_URL, origin: 'https://www.bigsight.jp', parse: parseTokyoBigSight },
  { name: '東京大学', url: UTOKYO_EVENTS_URL, origin: 'https://www.u-tokyo.ac.jp', parse: parseUTokyoEvents },
  { name: '東京都美術館', url: TOKYO_METROPOLITAN_ART_MUSEUM_URL, origin: 'https://www.tobikan.jp', parse: parseTokyoMetropolitanArtMuseum },
  { name: '東京藝術大学大学美術館', url: 'https://museum.geidai.ac.jp/exhibit/main/', origin: 'https://museum.geidai.ac.jp', place: '东京艺术大学大学美术馆 · 上野本馆', parse: parseGeidaiMuseum },
  { name: '東京藝術大学大学美術館', url: 'https://museum.geidai.ac.jp/exhibit/chinretsukan/', origin: 'https://museum.geidai.ac.jp', place: '东京艺术大学大学美术馆 · 陈列馆', parse: parseGeidaiMuseum },
  { name: '東京藝術大学大学美術館', url: 'https://museum.geidai.ac.jp/exhibit/masaki/', origin: 'https://museum.geidai.ac.jp', place: '东京艺术大学 · 正木纪念馆', parse: parseGeidaiMuseum },
  { name: '早稲田大学', url: WASEDA_EVENTS_URL, origin: 'https://www.waseda.jp', parse: parseWasedaEvents },
  { name: '渋谷PARCO', url: SHIBUYA_PARCO_EVENTS_URL, origin: 'https://shibuya.parco.jp', parse: parseShibuyaParcoEvents },
];

export { parseMyTokyo, parseRss, parseTokyoBigSight, parseUTokyoEvents, parseTokyoMetropolitanArtMuseum, parseGeidaiMuseum, parseWasedaEvents, parseShibuyaParcoEvents };
