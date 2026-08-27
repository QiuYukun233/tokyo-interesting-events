import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';
import { parseTokyoBigSight, TOKYO_BIG_SIGHT_URL } from './tokyo-big-sight.mjs';
import { parseUTokyoEvents, UTOKYO_EVENTS_URL } from './utokyo-events.mjs';
import { parseTokyoMetropolitanArtMuseum, TOKYO_METROPOLITAN_ART_MUSEUM_URL } from './tokyo-metropolitan-art-museum.mjs';
import { parseGeidaiMuseum } from './geidai-museum.mjs';
import { parseWasedaEvents, WASEDA_EVENTS_URL } from './waseda-events.mjs';
import { parseShibuyaParcoEvents, SHIBUYA_PARCO_EVENTS_URL } from './shibuya-parco-events.mjs';

/**
 * Source registry. Plan §3.3.
 *
 * The descriptive fields here are static; the observed fields (last success,
 * item counts, failure streak) live in data/source-registry.json and are
 * written by the pipeline. Keep `parserVersion` in step with real parser
 * changes — it is what tells you which sources to re-check after a rewrite.
 *
 * trustTier follows plan §3.1: S0 official venue/organiser, S1 official feed,
 * S2 reliable vertical or local media.
 */
export const SOURCES = [
  {
    name: 'My TOKYO', sourceFamily: 'government', trustTier: 'S1',
    url: 'https://www.my.metro.tokyo.lg.jp/event/?sort=near-end', origin: 'https://www.my.metro.tokyo.lg.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京都',
    parse: parseMyTokyo,
  },
  {
    name: 'Tokyo Big Sight', sourceFamily: 'exhibition_hall', trustTier: 'S0',
    url: TOKYO_BIG_SIGHT_URL, origin: 'https://www.bigsight.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 7,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京国际展示场',
    parse: parseTokyoBigSight,
  },
  {
    name: '東京大学', sourceFamily: 'university', trustTier: 'S0',
    url: UTOKYO_EVENTS_URL, origin: 'https://www.u-tokyo.ac.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 7,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京大学',
    parse: parseUTokyoEvents,
  },
  {
    name: '東京都美術館', sourceFamily: 'museum', trustTier: 'S0',
    url: TOKYO_METROPOLITAN_ART_MUSEUM_URL, origin: 'https://www.tobikan.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京都美术馆',
    parse: parseTokyoMetropolitanArtMuseum,
  },
  {
    name: '東京藝術大学大学美術館', sourceFamily: 'museum', trustTier: 'S0',
    url: 'https://museum.geidai.ac.jp/exhibit/main/', origin: 'https://museum.geidai.ac.jp',
    place: '东京艺术大学大学美术馆 · 上野本馆',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 30,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京艺术大学',
    parse: parseGeidaiMuseum,
  },
  {
    name: '東京藝術大学大学美術館', sourceFamily: 'museum', trustTier: 'S0',
    url: 'https://museum.geidai.ac.jp/exhibit/chinretsukan/', origin: 'https://museum.geidai.ac.jp',
    place: '东京艺术大学大学美术馆 · 陈列馆',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 30,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京艺术大学',
    parse: parseGeidaiMuseum,
  },
  {
    name: '東京藝術大学大学美術館', sourceFamily: 'museum', trustTier: 'S0',
    url: 'https://museum.geidai.ac.jp/exhibit/masaki/', origin: 'https://museum.geidai.ac.jp',
    place: '东京艺术大学 · 正木纪念馆',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 30,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '东京艺术大学',
    parse: parseGeidaiMuseum,
  },
  {
    name: '早稲田大学', sourceFamily: 'university', trustTier: 'S0',
    url: WASEDA_EVENTS_URL, origin: 'https://www.waseda.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 7,
    // /robots.txt sits behind a Cloudflare challenge and answers 403 to every
    // user agent while the event list itself serves normally. Handled as
    // "no robots.txt available" per RFC 9309 and flagged in the registry.
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '早稻田大学',
    parse: parseWasedaEvents,
  },
  {
    name: '渋谷PARCO', sourceFamily: 'commercial_venue', trustTier: 'S0',
    url: SHIBUYA_PARCO_EVENTS_URL, origin: 'https://shibuya.parco.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 7,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '涩谷 PARCO',
    parse: parseShibuyaParcoEvents,
  },
];

export { parseMyTokyo, parseRss, parseTokyoBigSight, parseUTokyoEvents, parseTokyoMetropolitanArtMuseum, parseGeidaiMuseum, parseWasedaEvents, parseShibuyaParcoEvents };
