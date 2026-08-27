import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';
import { parseTokyoBigSight, TOKYO_BIG_SIGHT_URL } from './tokyo-big-sight-v3.mjs';

export const SOURCES = [
  { name: 'My TOKYO', url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', origin: 'https://www.my.metro.tokyo.lg.jp', parse: parseMyTokyo },
  { name: 'Tokyo Big Sight', url: TOKYO_BIG_SIGHT_URL, origin: 'https://www.bigsight.jp', parse: parseTokyoBigSight },
];

export { parseMyTokyo, parseRss, parseTokyoBigSight };
