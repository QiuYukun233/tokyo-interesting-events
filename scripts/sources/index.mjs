import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';

export const SOURCES = [
  { name: 'My TOKYO', url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', origin: 'https://www.my.metro.tokyo.lg.jp', parse: parseMyTokyo },
];

export { parseMyTokyo, parseRss };
