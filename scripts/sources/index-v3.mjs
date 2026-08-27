import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';
import { parseTokyoBigSight, TOKYO_BIG_SIGHT_URL } from './tokyo-big-sight-v3.mjs';
import { parseUTokyoEvents, UTOKYO_EVENTS_URL } from './utokyo-events.mjs';
import { parseTokyoMetropolitanArtMuseum, TOKYO_METROPOLITAN_ART_MUSEUM_URL } from './tokyo-metropolitan-art-museum-v4.mjs';

export const SOURCES = [
  { name: 'My TOKYO', url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', origin: 'https://www.my.metro.tokyo.lg.jp', parse: parseMyTokyo },
  { name: 'Tokyo Big Sight', url: TOKYO_BIG_SIGHT_URL, origin: 'https://www.bigsight.jp', parse: parseTokyoBigSight },
  { name: '東京大学', url: UTOKYO_EVENTS_URL, origin: 'https://www.u-tokyo.ac.jp', parse: parseUTokyoEvents },
  { name: '東京都美術館', url: TOKYO_METROPOLITAN_ART_MUSEUM_URL, origin: 'https://www.tobikan.jp', parse: parseTokyoMetropolitanArtMuseum },
];

export { parseMyTokyo, parseRss, parseTokyoBigSight, parseUTokyoEvents, parseTokyoMetropolitanArtMuseum };
