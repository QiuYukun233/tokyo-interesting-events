import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * cinematokyo.com — 東京ミニシアター上映時間, a bilingual aggregator of
 * mini-theater / 名画座 / independent cinema showtimes, updated daily from the
 * theatres' own pages. Individually run (footer credit「サイト制作: ネルキ・リオ」),
 * the same precedent as mdms-mania.
 *
 * Why this and not cinemap.tokyo: cinemap's dates are free text
 * (「8/28(金)よりロードショー」「９月中旬まで(予定)」, often empty), while this
 * site publishes one JSON file, `data/showtimes.json`, with one row per
 * showtime and an ISO `date_text` on every row (3,863/3,863 on 2026-09-02).
 * The page itself links that file as「上映情報JSONをダウンロード」— it is
 * offered for download, not an internal feed we found by accident.
 *
 * robots.txt (2026-09-02): `User-agent: * / Allow: /` plus a sitemap. No
 * terms-of-use page exists; the only policy text is the footer disclaimer
 * 「上映情報は各劇場サイトから取得しています。最終確認は公式ページでお願いします」,
 * which is exactly what our cards do (summary + link back). The rows also
 * carry TMDB/Filmarks/Letterboxd enrichment (ratings, poster paths, English
 * synopses); none of that is used here — only the facts the theatres
 * themselves publish: cinema, title, director, date, showtime, synopsis.
 * `detail_page_url` is not used as sourceUrl either: it is shared across
 * cinemas (eiga.com pages) or across films (a theatre's schedule page), and
 * `stableEventId` hashes sourceUrl — the aggregator's own deep link is the
 * one URL that is unique per (cinema, film).
 *
 * Coverage is wider than the name: the site's own region list files nine
 * cinemas under 神奈川 and four under 埼玉・千葉. Those are dropped here — the
 * pool is Tokyo-only — by the site's own categorisation plus a name pattern
 * for cinemas added later.
 *
 * The file is ~14 MB (two months of showtimes with enrichment). One request
 * a day is still far less than a single browsing session of the page, which
 * fetches the same file on every load.
 *
 * Candidate unit: one film's run at one cinema (方案 §4.3). The JSON is
 * per-showtime, so `mapRecord` normalises rows and `aggregateRuns` folds them
 * into runs — register both `map` and `aggregate`.
 */
export const CINEMATOKYO_ORIGIN = 'https://cinematokyo.com';
export const CINEMATOKYO_SHOWTIMES_URL = `${CINEMATOKYO_ORIGIN}/data/showtimes.json`;

/**
 * The site's own `cinemaCategories` entries for 神奈川 and 埼玉・千葉
 * (read from the page script, 2026-09-02). Kept verbatim so a future diff
 * against the page is a plain comparison.
 */
export const OUTSIDE_TOKYO_CINEMAS = new Set([
  // 神奈川
  'kino cinéma横浜みなとみらい', '横浜シネマ・ジャック＆ベティ', 'シネマ・ノヴェチェント', '横浜シネマリン',
  '川崎市アートセンター アルテリオ映像館', 'あつぎのえいがかんkiki', '小田原シネマ館', 'シネコヤ', 'CINEMA AMIGO',
  // 埼玉・千葉
  '川越スカラ座', '深谷シネマ', 'キネマ旬報シアター', '千葉劇場',
]);

/** Safety net for cinemas the site adds after the list above was copied. */
const OUTSIDE_TOKYO_PATTERN = /横浜|川崎|千葉|埼玉|川越|深谷|小田原|あつぎ|厚木|藤沢|鎌倉|大宮|柏|船橋/;

const compact = (value = '') => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Cap at 300 chars, on a sentence boundary when one falls in the back half. */
function clip(text, max = 300) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const stop = head.lastIndexOf('。');
  return stop >= max / 2 ? head.slice(0, stop + 1) : `${head}…`;
}

export function isTokyoCinema(name = '') {
  const cinema = compact(name);
  return Boolean(cinema) && !OUTSIDE_TOKYO_CINEMAS.has(cinema) && !OUTSIDE_TOKYO_PATTERN.test(cinema);
}

/** `『 浪華悲歌 』` → `浪華悲歌`; the raw title keeps the theatre's own quoting. */
export function cleanTitle(row) {
  if (!row) return '';
  const raw = compact(row.clean_title_jp || row.movie_title_jp || row.movie_title);
  return raw.replace(/^[『「\s]+/, '').replace(/[』」\s]+$/, '').trim();
}

/** Only strict `YYYY-MM-DD` is accepted — the field has been exactly that so far. */
export function isoDate(value = '') {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? match[0] : null;
}

/**
 * Deep link into the aggregator: its state lives in the URL hash
 * (`#view=cinema&cinema=…&q=…`), so this opens the cinema's schedule filtered
 * to the film. Unique per (cinema, film), which is what `stableEventId` hashes.
 */
export function runUrl(cinema, title) {
  const params = new URLSearchParams({ view: 'cinema', cinema, q: title });
  return `${CINEMATOKYO_ORIGIN}/#${params}`;
}

/**
 * Map one showtime row to a per-showtime candidate. Valid on its own
 * (startDate = that day, time = that showtime) so a missing `aggregate` still
 * yields real candidates, just too many of them.
 */
export function mapShowtime(row, source, index = 0) {
  const cinema = compact(row?.cinema_name);
  const title = cleanTitle(row);
  const startDate = isoDate(row?.date_text);
  if (!cinema || !title || !startDate || !isTokyoCinema(cinema)) return null;

  const director = compact(row.director || row.director_jp);
  const synopsis = compact(row.synopsis).replace(/^(かいせつ|解説|あらすじ)\s*/, '');
  const description = clip([director && `監督：${director}`, synopsis].filter(Boolean).join('｜'));
  const program = compact(row.program_title);
  const showtime = compact(row.showtime);

  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: runUrl(cinema, title),
    title,
    startDate,
    place: cinema,
    time: /^\d{1,2}:\d{2}$/.test(showtime) ? showtime : '详见活动页',
    price: '详见活动页',
    text: `${title} 映画 上映 ミニシアター ${program}`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    category: 'ミニシアター上映',
    ...(description ? { description } : {}),
    ...(program ? { attribution: program } : {}),
  };
}

/** Adapter entry point: the pipeline hands over the already-parsed JSON array. */
export const mapRecord = (row, source, index = 0) => mapShowtime(row, source, index);

/**
 * Fold per-showtime candidates into one candidate per (cinema, film):
 * startDate = first showing, endDate = last showing when it differs, time =
 * how many showings and at what hours. A screening-day count is what tells
 * you whether this is a one-off 特集上映 or a three-week run.
 */
export function aggregateRuns(showings = []) {
  const runs = new Map();
  for (const showing of showings) {
    if (!showing?.sourceUrl || !showing.startDate) continue;
    const run = runs.get(showing.sourceUrl) ?? { ...showing, dates: new Set(), times: new Set(), count: 0 };
    run.count += 1;
    run.dates.add(showing.startDate);
    if (/^\d{1,2}:\d{2}$/.test(showing.time)) run.times.add(showing.time);
    // Keep the richest description seen; rows of one run can differ in enrichment.
    if ((showing.description?.length ?? 0) > (run.description?.length ?? 0)) run.description = showing.description;
    runs.set(showing.sourceUrl, run);
  }

  // Per-showtime candidates never carry endDate, so spreading `run` cannot
  // leak a stale one; startDate/time are overwritten below.
  return [...runs.values()].map(({ dates, times, count, ...run }) => {
    const days = [...dates].sort();
    const hours = [...times].sort();
    const startDate = days[0];
    const endDate = days.at(-1) !== startDate ? days.at(-1) : undefined;
    const time = hours.length
      ? `${count}回上映 · ${hours.slice(0, 4).join(' / ')}${hours.length > 4 ? ' ほか' : ''}`
      : '详见活动页';
    return { ...run, startDate, ...(endDate ? { endDate } : {}), time };
  });
}
