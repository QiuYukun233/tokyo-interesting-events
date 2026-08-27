/**
 * The unified object model from plan §4.1.
 *
 * "去处" is not only an event. Sorting candidates by what kind of thing they
 * are is what makes the back office readable, and it is also what the discovery
 * queue will need later: plan §7.1 requires type diversity in a round, which is
 * impossible to enforce while everything is an undifferentiated "event".
 *
 * Derived, never authored: each source already carries the evidence (a change
 * type, a genre label, an admission audience, a date span). Storing the derived
 * value keeps the back office queryable without re-running this on every read.
 *
 * Pure functions.
 */

export const OBJECT_TYPES = ['event', 'exhibition', 'place', 'opening', 'closing', 'activity', 'open_facility'];

export const OBJECT_TYPE_LABELS = {
  event: '单次事件',
  exhibition: '展览',
  place: '值得专程去的场所',
  opening: '新开・重开',
  closing: '即将消失',
  activity: '可参与的体验',
  open_facility: '特别开放',
};

/** Genre labels from 体験100 that describe participation rather than viewing. */
const HANDS_ON_GENRES = /ワークショップ|見学・ツアー|こども|鑑賞サポート|歴史・伝統|テクノロジー/;

/** Genre labels that describe a scheduled performance or talk. */
const SCHEDULED_GENRES = /パフォーマンス|トーク・講座|オンライン/;

const EXHIBITION_WORDS = /展覧会|企画展|特別展|コレクション展|常設展|展示/;
const OPEN_FACILITY_WORDS = /一般公開|特別公開|オープンキャンパス|公開日|バックヤード|施設公開|オープンハウス/;

const text = (event) => `${event?.title ?? ''} ${event?.titleZh ?? ''} ${event?.category ?? ''} ${event?.description ?? ''}`;

/** Days a candidate runs; 1 for a single day, null when there is no end date. */
export function runLengthDays(event) {
  if (!event?.startDate || !event?.endDate) return null;
  const start = new Date(`${event.startDate}T00:00:00+09:00`);
  const end = new Date(`${event.endDate}T00:00:00+09:00`);
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Classify a candidate into the plan's object model.
 *
 * Order matters: a shop closing that happens to mention an exhibition is still
 * a closing, because the deadline is the reason to care.
 */
export function objectTypeFor(event = {}) {
  if (event.changeType === 'closing') return 'closing';
  if (event.changeType === 'opening') return 'opening';
  // `discovery` covers relocations, renewals and pop-ups — a place, not a date.
  if (event.changeType === 'discovery') return 'place';

  const body = text(event);
  if (OPEN_FACILITY_WORDS.test(body)) return 'open_facility';

  const genre = String(event.category ?? '');
  if (HANDS_ON_GENRES.test(genre)) return 'activity';
  if (SCHEDULED_GENRES.test(genre)) return 'event';

  const days = runLengthDays(event);
  // A run of more than a week that reads as an exhibition is one; a long run
  // without exhibition wording is still a standing thing worth a visit.
  if (EXHIBITION_WORDS.test(body) && (days === null || days > 1)) return 'exhibition';
  if (days !== null && days > 7) return 'exhibition';
  return 'event';
}

/** Group candidates by object type, preserving the plan's declared order. */
export function groupByObjectType(candidates = []) {
  const groups = Object.fromEntries(OBJECT_TYPES.map((type) => [type, []]));
  for (const candidate of candidates) {
    const type = candidate.objectType || objectTypeFor(candidate);
    (groups[type] ||= []).push(candidate);
  }
  return groups;
}
