import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 区市町村のスポーツ施設 — public sports facilities, from the wards' own open
 * data, kept only where you can do something unusual there.
 *
 * This fills 方案 §3.2's 「新运动与参与式消遣」, the family that has stayed
 * emptiest, and it does it from the one angle that turned out to be tractable.
 * Courses ("是几号的弓道教室") are locked behind each ward's members-only
 * booking system; **facilities** ("哪里能射弓道") are published as open data by
 * the wards themselves.
 *
 * ## Why this source is unusually trustworthy
 *
 * The 推奨データセット format gives every Olympic and budō discipline **its own
 * column**, with 有/無 filled in by the ward. So 「この体育館で弓道ができる」 is
 * a fact its operator declared, not a guess from a keyword in a name — the same
 * class of evidence as Big Sight's 来場対象者, which 决策记录/0002 accepts.
 *
 * Every dataset is CC BY, so reuse is explicitly permitted with attribution.
 * Discovery is the 東京都 CKAN catalogue, which the pipeline already polls for
 * exactly this purpose (方案 §4.3 of docs/信息获取管道设计.md).
 *
 * ## What is kept, and why the first attempt was wrong
 *
 * The first version kept any facility offering a rare competitive discipline —
 * 弓道, なぎなた, フェンシング. **Human review rejected 9 of the 11 it judged**,
 * including a building literally named 「弓道場」, and the reason is worth
 * recording: *a ward gym having an archery range is not a destination.* To
 * shoot there you must join, book, and bring your own equipment. The room
 * exists; the outing does not.
 *
 * What survives review is a different property: **can you turn up and enjoy
 * it**. A pool, a skate park, a canoe course — walk-in leisure. So the filter
 * is now LEISURE_FACILITIES matched against the facility's *name*, which is
 * where that property is actually stated, and the sport columns are used only
 * to describe what is there.
 *
 * School facilities are excluded even when they hold a pool: 「五本木小学校屋内
 * プール」 and 「品川学園温水プール」 open to residents on limited terms, not to
 * a visitor deciding where to go on Saturday.
 *
 * Of 1,042 facilities across 62 datasets, about 70 pass — down from 139, and a
 * different 70.
 *
 * **Known gap:** the datasets carry no "open to the public" field. Opening days
 * and hours are there, but nothing states whether outsiders may use the place,
 * so the school-name exclusion is a proxy, not a guarantee.
 *
 * ## Two traps, both measured
 *
 * - The sport columns hold **有/無**, not blank/non-blank. Treating "present"
 *   as "available" marks every facility as offering every sport — the first
 *   attempt reported all twelve disciplines hitting exactly 169 times, and the
 *   suspiciously round number is what exposed it.
 * - Some CSV links in the catalogue 404 (three of 65 when measured). A dead
 *   link must skip that ward, not abort the run.
 */

/**
 * Facilities you can turn up at and enjoy, recognised by name.
 *
 * Not a list of sports: 「弓道場」 names a rare sport and is still not a
 * destination, while 「プール」 names an ordinary one and is. The distinction
 * that survived review is walk-in leisure, and the name is where it is stated.
 */
export const LEISURE_FACILITIES = /プール|水泳場|水上|スケート|アイスリンク|ボルダリング|クライミング|カヌー|ボート|サイクリング|アスレチック|レジャー/;

/**
 * School facilities, excluded. They open to residents on limited terms — not
 * to someone deciding where to go on Saturday.
 */
export const SCHOOL_FACILITY = /小学校|中学校|高等学校|学園|学校/;

/**
 * Facilities the ward has taken out of service, excluded — a shut pool is not
 * somewhere to go. 「あきる野市民プール（屋外）（令和8年まで閉場）」 says so in
 * its own name.
 *
 * Matched against the **name only**, deliberately. The opening-hours field is
 * full of ordinary closures — 「第２・４火曜日休館日」 is a weekly rest day, not
 * a closed facility — and reading that as "out of service" would drop a working
 * pool. A ward writing the closure into the facility's name means it.
 */
export const OUT_OF_SERVICE = /閉場|閉鎖|休止|廃止|工事中|改修中|準備中/;

/** Sport columns, used to describe a kept facility rather than to select it. */
export const SPORT_COLUMNS = [
  '水泳', 'スケート', 'カヌー', 'ボート', 'セーリング', '山岳・スポーツクライミング',
  'アイスホッケー', '弓道', 'アーチェリー', 'フェンシング', 'なぎなた', '相撲',
];

/** The catalogue query that finds these datasets. */
export const CKAN_SEARCH_URL = 'https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_search?q=%E3%82%B9%E3%83%9D%E3%83%BC%E3%83%84%E6%96%BD%E8%A8%AD&rows=200';

const compact = (value = '') => String(value).replace(/[\s　]+/g, ' ').trim();

/** The wards write 有/無; anything else (○, あり) is accepted too. */
export const isAvailable = (value) => /^(有|○|◯|あり|可)/.test(compact(value));

/** Datasets whose title says they list sports facilities, with a CSV resource. */
export function selectDatasets(payload) {
  return (payload?.result?.results ?? [])
    .filter((dataset) => /スポーツ施設|体育施設|運動施設/.test(dataset.title ?? ''))
    .map((dataset) => {
      const csv = (dataset.resources ?? []).find((resource) => String(resource.format ?? '').toUpperCase() === 'CSV');
      return csv && {
        org: compact(dataset.organization?.title),
        title: compact(dataset.title),
        licence: compact(dataset.license_title),
        url: csv.url,
      };
    })
    .filter(Boolean);
}

/**
 * One CSV row → one `place` candidate, or null when the facility offers nothing
 * out of the ordinary.
 *
 * @param {object} row      a 推奨データセット sports-facility row
 * @param {{name: string, startDate: string, org?: string}} source
 */
export function mapFacility(row, source, index = 0) {
  const title = compact(row?.['名称']);
  const address = compact(row?.['所在地_連結表記']) || compact(`${row?.['所在地_市区町村'] ?? ''}${row?.['所在地_町字'] ?? ''}`);
  if (!title || !address || !source?.startDate) return null;
  if (!LEISURE_FACILITIES.test(title) || SCHOOL_FACILITY.test(title) || OUT_OF_SERVICE.test(title)) return null;
  const sports = SPORT_COLUMNS.filter((sport) => isAvailable(row?.[sport]));

  const hours = [compact(row?.['利用可能曜日']), compact(row?.['開始時間'])].filter(Boolean).join(' ');
  const candidate = createEventCandidate({
    sourceName: source.name,
    // The facility's own page when the ward gives one; the ward is the citation
    // otherwise, and the name keeps ids distinct.
    sourceUrl: compact(row?.['URL']) || `${source.datasetUrl ?? ''}#${encodeURIComponent(title)}`,
    title,
    startDate: source.startDate,
    place: address.startsWith('東京都') ? address : `東京都${address}`,
    time: hours || '详见设施',
    price: '详见设施',
    text: `${title} ${sports.join(' ')} プール スケート 水遊び ${source.org ?? ''}`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    category: sports[0] ?? '水遊び・レジャー',
    description: sports.length ? `${sports.join('・')}ができる公共施設。` : '公共のレジャー施設。',
    attribution: `${source.org ?? source.name}（CC BY）`,
    why: '思い立った日にふらっと行って遊べる公共施設。区の公開データで設備が確認できている。',
  };
}

/** Map one ward's CSV. */
export function mapFacilities(records = [], source) {
  return records.map((row, index) => mapFacility(row, source, index)).filter(Boolean);
}
