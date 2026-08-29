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
 * ## What is kept
 *
 * Only facilities offering at least one discipline from NICHE_SPORTS. A ward
 * gym with a swimming pool and table tennis is a real facility and a bad
 * candidate: nobody makes a trip across Tokyo for the nearest ping-pong table.
 * 「弓道場がある」 or 「なぎなたができる」 is a reason to go somewhere specific,
 * which is the whole test. Of 1,071 facilities across 62 datasets, 139 pass.
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
 * Disciplines worth crossing town for. Deliberately excludes the ordinary
 * furniture of a municipal gym — pool, tennis, table tennis, baseball, futsal —
 * which is where almost every facility would otherwise qualify.
 */
export const NICHE_SPORTS = [
  '弓道', 'アーチェリー', 'フェンシング', 'なぎなた', '銃剣道', '相撲',
  '山岳・スポーツクライミング', 'ライフル射撃', 'クレー射撃', '馬術',
  'カヌー', 'ボート', 'セーリング', 'アイスホッケー', 'スケート',
  'ホッケー', 'レスリング', 'ボクシング', '近代五種', '空手道', '柔道', '剣道',
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
  const sports = NICHE_SPORTS.filter((sport) => isAvailable(row?.[sport]));
  if (!title || !address || !sports.length || !source?.startDate) return null;

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
    text: `${title} ${sports.join(' ')} スポーツ施設 ${source.org ?? ''}`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    category: sports[0],
    description: `${sports.join('・')}ができる公共施設。`,
    attribution: `${source.org ?? source.name}（CC BY）`,
    why: `都内で${sports[0]}ができる場所は多くない。区の公開データで設備が確認できている。`,
  };
}

/** Map one ward's CSV. */
export function mapFacilities(records = [], source) {
  return records.map((row, index) => mapFacility(row, source, index)).filter(Boolean);
}
