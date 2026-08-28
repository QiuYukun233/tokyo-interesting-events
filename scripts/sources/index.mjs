import { parseMyTokyo } from './my-tokyo.mjs';
import { parseRss } from './rss.mjs';
import { mapRecord as mapTokyoBigSight, TOKYO_BIG_SIGHT_URL } from './tokyo-big-sight.mjs';
import { parseUTokyoEvents, UTOKYO_EVENTS_URL } from './utokyo-events.mjs';
import { parseTokyoMetropolitanArtMuseum, TOKYO_METROPOLITAN_ART_MUSEUM_URL } from './tokyo-metropolitan-art-museum.mjs';
import { parseGeidaiMuseum } from './geidai-museum.mjs';
import { parseWasedaEvents, WASEDA_EVENTS_URL } from './waseda-events.mjs';
import { parseShibuyaParcoEvents, SHIBUYA_PARCO_EVENTS_URL } from './shibuya-parco-events.mjs';
import { mapRecord as mapRekibun, parseRekibunHandsOn, REKIBUN_BENEFITS_URL, REKIBUN_HANDS_ON_URLS } from './rekibun.mjs';
import { CORICH_URLS, parseCorich } from './corich.mjs';
import { parseScrap } from './scrap.mjs';
import { mapRecord as mapYoshimoto, yoshimotoUrl } from './yoshimoto.mjs';
import { SANBO_HALLS, SANBO_ORIGIN, parseSanbo, sanboUrls } from './sanbo.mjs';

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
    // The venue's own open data, not its HTML listing: ten events became 154,
    // and 来場対象者 replaced a regex guess at who may attend.
    name: 'Tokyo Big Sight', sourceFamily: 'exhibition_hall', trustTier: 'S0',
    url: TOKYO_BIG_SIGHT_URL, origin: 'https://www.opendata.metro.tokyo.lg.jp',
    accessMethod: 'csv', crawlFrequency: 'daily', expectedUpdateWindowDays: 30,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '东京国际展示场（東京都开放数据）',
    map: mapTokyoBigSight,
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
    // One operator reaches 都美術館 / 現代美術館 / 写真美術館 / 庭園美術館 /
    // 江戸東京たてもの園 at once — the lawful route to the art listings that
    // Tokyo Art Beat aggregates but does not license.
    name: '東京都歴史文化財団', sourceFamily: 'museum_operator', trustTier: 'S0',
    url: REKIBUN_BENEFITS_URL, origin: 'https://www.rekibun.or.jp',
    accessMethod: 'json', crawlFrequency: 'daily', expectedUpdateWindowDays: 30,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '公益财团法人东京都历史文化财团',
    map: mapRekibun,
  },
  {
    // アート・カルチャー体験100 — workshops, tours, talks and children's
    // programmes across the same operator's venues. This is the plan's
    // 参与式消遣 family, which had no source at all.
    name: '東京都歴史文化財団 · 体験100', sourceFamily: 'hands_on', trustTier: 'S0',
    url: REKIBUN_HANDS_ON_URLS[0], urls: REKIBUN_HANDS_ON_URLS, origin: 'https://www.rekibun.or.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '公益财团法人东京都历史文化财团',
    parse: parseRekibunHandsOn,
  },
  {
    name: '渋谷PARCO', sourceFamily: 'commercial_venue', trustTier: 'S0',
    url: SHIBUYA_PARCO_EVENTS_URL, origin: 'https://shibuya.parco.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 7,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-27', ownerOrContact: '涩谷 PARCO',
    parse: parseShibuyaParcoEvents,
  },
  {
    // リアル脱出ゲーム池袋店 — SCRAP's own store page doubles as its event list; escape
    // rooms run as rotating limited-run "games", not dated one-off events.
    name: 'リアル脱出ゲーム池袋店', sourceFamily: 'entertainment', trustTier: 'S0',
    url: 'https://www.scrapmagazine.com/ikebukuro/', origin: 'https://www.scrapmagazine.com',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '株式会社SCRAP',
    family: 'shop', parse: parseScrap,
  },
  {
    // リアル脱出ゲーム吉祥寺店 — SCRAP's own store page doubles as its event list; escape
    // rooms run as rotating limited-run "games", not dated one-off events.
    name: 'リアル脱出ゲーム吉祥寺店', sourceFamily: 'entertainment', trustTier: 'S0',
    url: 'https://www.scrapmagazine.com/nazobldg_kichijoji/', origin: 'https://www.scrapmagazine.com',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '株式会社SCRAP',
    family: 'shop', parse: parseScrap,
  },
  {
    // 東京ミステリーサーカス — SCRAP's own store page doubles as its event list; escape
    // rooms run as rotating limited-run "games", not dated one-off events.
    name: '東京ミステリーサーカス', sourceFamily: 'entertainment', trustTier: 'S0',
    url: 'https://mysterycircus.jp/events/', origin: 'https://mysterycircus.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '株式会社SCRAP',
    family: 'tmc', parse: parseScrap,
  },
  {
    // YOSHIMOTO ROPPONGI THEATER — the venue page's own async schedule feed, called at the same
    // low, once-daily cadence as everything else here. See scripts/sources/yoshimoto.mjs.
    name: 'YOSHIMOTO ROPPONGI THEATER', sourceFamily: 'entertainment', trustTier: 'S1',
    url: yoshimotoUrl('roppongi'), origin: 'https://feed-api.yoshimoto.co.jp',
    place: '六本木',
    accessMethod: 'json', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '吉本興業株式会社',
    map: mapYoshimoto,
  },
  {
    // 渋谷よしもと漫才劇場 — the venue page's own async schedule feed, called at the same
    // low, once-daily cadence as everything else here. See scripts/sources/yoshimoto.mjs.
    name: '渋谷よしもと漫才劇場', sourceFamily: 'entertainment', trustTier: 'S1',
    url: yoshimotoUrl('shibuya_manzaigekijyo'), origin: 'https://feed-api.yoshimoto.co.jp',
    place: '渋谷',
    accessMethod: 'json', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '吉本興業株式会社',
    map: mapYoshimoto,
  },
  {
    // 神保町よしもと漫才劇場 — the venue page's own async schedule feed, called at the same
    // low, once-daily cadence as everything else here. See scripts/sources/yoshimoto.mjs.
    name: '神保町よしもと漫才劇場', sourceFamily: 'entertainment', trustTier: 'S1',
    url: yoshimotoUrl('jimbocho_manzaigekijyo'), origin: 'https://feed-api.yoshimoto.co.jp',
    place: '神保町',
    accessMethod: 'json', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '吉本興業株式会社',
    map: mapYoshimoto,
  },
  {
    // ルミネtheよしもと — the venue page's own async schedule feed, called at the same
    // low, once-daily cadence as everything else here. See scripts/sources/yoshimoto.mjs.
    name: 'ルミネtheよしもと', sourceFamily: 'entertainment', trustTier: 'S1',
    url: yoshimotoUrl('lumine'), origin: 'https://feed-api.yoshimoto.co.jp',
    place: '新宿',
    accessMethod: 'json', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '吉本興業株式会社',
    map: mapYoshimoto,
  },
  {
    // Nationwide theatre/musical listing, filtered to Tokyo client-side —
    // no genre gate, deliberately: 落語, 2.5次元舞台, 一人芝居 alongside the
    // mainstream is the point (plan §3.2「小型文化与亚文化」).
    name: 'CoRich舞台芸術！', sourceFamily: 'local_media', trustTier: 'S2',
    url: CORICH_URLS[0], urls: CORICH_URLS, origin: 'https://stage.corich.jp',
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 3,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '株式会社CoRich',
    parse: parseCorich,
  },
  // The two halls where most of Tokyo's small 即売会 actually happen. Unlike
  // every other source here this is a venue calendar — "whatever anybody
  // booked this room for" — so it reaches hundreds of one-off organisers too
  // small to be worth their own adapter. 区分 and 公開区分 come from the
  // venue's own booking record; the latter drives rule:not_open_to_public.
  ...SANBO_HALLS.map((hall) => ({
    name: hall.name, sourceFamily: 'exhibition_hall', trustTier: 'S0',
    url: sanboUrls(hall.key)[0], urls: sanboUrls(hall.key), origin: SANBO_ORIGIN,
    venue: hall.venue,
    accessMethod: 'html', crawlFrequency: 'daily', expectedUpdateWindowDays: 14,
    robotsAndTermsCheckedAt: '2026-08-28', parserVersion: '2026-08-28', ownerOrContact: '东京都立产业贸易中心',
    parse: parseSanbo,
  })),
];

export { parseMyTokyo, parseRss, parseUTokyoEvents, parseTokyoMetropolitanArtMuseum, parseGeidaiMuseum, parseWasedaEvents, parseShibuyaParcoEvents };
