import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 国土交通省 インフラツーリズム ポータルサイト — tour search page.
 * (mlit.go.jp/sogoseisaku/region/infratourism/toursearch/)
 *
 * One 550KB page carrying every registered infrastructure tour nationwide
 * (477 on 2026-09-02), each an `<li class="bl_searchResultBlock_item">` with
 * `data-type=<prefecture>`; Tokyo has five entries (four distinct — バスタ新宿
 * is listed twice), far fewer than the 20–40 the round-six survey guessed.
 *
 * These are standing visit programmes, not dated events: "twice a month on
 * Saturdays", "weekdays except Monday". So they are `place` candidates with
 * `ongoing: true`, dated from the crawl day (same convention as
 * scripts/sources/mdms-mania.mjs), and the human-readable schedule text is
 * kept in `time`.
 *
 * Terms: mlit.go.jp has no robots.txt (404) and `/link.html` places the site
 * under 公共データ利用規約 (PDL1.0, CC BY-equivalent) — attribution suffices.
 * The cleanest source in the survey.
 */
export const INFRA_TOURISM_URL = 'https://www.mlit.go.jp/sogoseisaku/region/infratourism/toursearch/';

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').replace(/[◼■◾️]/g, '').trim();

/** `◼開催日/開催期間：毎月1回実施（事前申込）※詳細はHP参照` → the text after the label. */
function scheduleFrom(paragraphs) {
  const line = paragraphs.find((p) => p.includes('開催日'));
  if (!line) return null;
  return compact(line.replace(/^.*?開催期間\s*[：:]\s*/, '')) || null;
}

export function parseInfraTourism(html, source) {
  const $ = cheerio.load(html);
  const wanted = source?.prefecture ?? 'tokyo';
  const seen = new Set();
  const places = [];
  $(`li.bl_searchResultBlock_item[data-type="${wanted}"]`).each((index, node) => {
    const item = $(node);
    const facility = compact(item.find('.s__title h3').first().text());
    const tour = compact(item.find('.s__text h4').first().text());
    const placeNode = item.find('.s__place').first();
    const kind = compact(placeNode.find('span').first().text());
    const address = compact(placeNode.clone().children('span').remove().end().text());
    const organizer = compact(item.find('.s__syusai').first().text());
    const paragraphs = item.find('.s__text p').toArray().map((p) => compact($(p).text()));
    const homepage = item.find('.s__text a[href]').first().attr('href') || null;
    const blurb = paragraphs.find((p) => p && !p.includes('開催日') && !p.includes('お問い合わせ') && !/^\S+\s*\d{2,4}-\d{2,4}-\d{3,4}$/.test(p)) || '';

    const title = tour || facility;
    if (!title) return;
    const key = `${homepage ?? ''}|${title}`;
    if (seen.has(key)) return;
    seen.add(key);

    const candidate = createEventCandidate({
      sourceName: source.name,
      sourceUrl: homepage ?? INFRA_TOURISM_URL,
      title,
      startDate: source.startDate,
      place: [facility, address].filter(Boolean).join(' · '),
      time: scheduleFrom(paragraphs) ?? '详见活动页',
      price: '详见活动页',
      text: `${title} ${facility} ${kind} 見学 インフラ`,
      visualIndex: index,
    });
    if (!candidate) return;
    places.push({
      ...candidate,
      ongoing: true,
      category: kind && kind !== 'その他' ? `インフラ見学・${kind}` : 'インフラ見学',
      ...(organizer ? { attribution: organizer } : {}),
      ...(blurb ? { description: blurb.slice(0, 300) } : {}),
    });
  });
  return places;
}
