import { DatabaseSync } from 'node:sqlite';
import { objectTypeFor } from './object-type.mjs';

/**
 * The candidate pool.
 *
 * Why a database and not another JSON file: the back office needs to ask
 * questions JSON cannot answer cheaply — what is pending, of which type, from
 * which source, seen when, decided by whom — and it needs decisions to survive
 * every re-crawl.
 *
 * The central rule is the separation of two tables:
 *
 *   candidates — what the crawl found. Rewritten on every run.
 *   decisions  — what a human or a rule concluded. **Never touched by the crawl.**
 *
 * A candidate with no decision row is pending: that is how "new items wait in
 * the back office" works, without a flag the pipeline could accidentally reset.
 *
 * `decidedBy` records who decided — `human` today, `rule:<name>` when the
 * automatic gate exists. Both write the same row, so switching a category over
 * to automatic promotion later is a change of author, not of schema.
 *
 * SQLite via node:sqlite (built into Node, no dependency).
 */

export const STATES = ['published', 'rejected'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidates (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  titleZh       TEXT,
  place         TEXT,
  time          TEXT,
  price         TEXT,
  vibe          TEXT,
  color         TEXT,
  symbol        TEXT,
  startDate     TEXT NOT NULL,
  endDate       TEXT,
  sourceUrl     TEXT,
  source        TEXT,
  sourceFamily  TEXT,
  objectType    TEXT NOT NULL,
  category      TEXT,
  audience      TEXT,
  description   TEXT,
  why           TEXT,
  changeType    TEXT,
  attribution   TEXT,
  imageUrl      TEXT,
  ongoing       INTEGER NOT NULL DEFAULT 0,
  reasons       TEXT NOT NULL DEFAULT '[]',
  signals       TEXT NOT NULL DEFAULT '[]',
  firstSeenAt   TEXT NOT NULL,
  lastSeenAt    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_start ON candidates(startDate);
CREATE INDEX IF NOT EXISTS candidates_type  ON candidates(objectType);

CREATE TABLE IF NOT EXISTS decisions (
  candidateId TEXT PRIMARY KEY,
  state       TEXT NOT NULL CHECK (state IN ('published','rejected')),
  decidedBy   TEXT NOT NULL,
  reason      TEXT,
  note        TEXT,
  decidedAt   TEXT NOT NULL
);
`;

/** Columns the crawl owns, in insert order. */
const CANDIDATE_COLUMNS = [
  'id', 'title', 'titleZh', 'place', 'time', 'price', 'vibe', 'color', 'symbol',
  'startDate', 'endDate', 'sourceUrl', 'source', 'sourceFamily', 'objectType',
  'category', 'audience', 'description', 'why', 'changeType', 'attribution', 'imageUrl',
  'ongoing', 'reasons', 'signals',
];

/**
 * Columns added after the first schema shipped. `CREATE TABLE IF NOT EXISTS`
 * does nothing to a table that already exists, so an existing pool.db needs
 * these added explicitly.
 */
const ADDED_COLUMNS = [
  ['ongoing', 'INTEGER NOT NULL DEFAULT 0'],
];

export function openPool(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  const existing = new Set(db.prepare('PRAGMA table_info(candidates)').all().map((row) => row.name));
  for (const [column, definition] of ADDED_COLUMNS) {
    if (!existing.has(column)) db.exec(`ALTER TABLE candidates ADD COLUMN ${column} ${definition}`);
  }
  return db;
}

const nullable = (value) => (value === undefined || value === '' ? null : value);

/**
 * Insert or refresh one candidate.
 *
 * `firstSeenAt` is preserved across runs — it is how the back office shows what
 * actually arrived today rather than what merely got re-crawled today.
 */
export function upsertCandidate(db, event, { now, reasons = [], signals = [] } = {}) {
  const at = (now ?? new Date()).toISOString();
  const objectType = event.objectType || objectTypeFor(event);
  const values = {
    ...Object.fromEntries(CANDIDATE_COLUMNS.map((column) => [column, nullable(event[column])])),
    objectType,
    // SQLite has no boolean; store the flag as 0/1 so the horizon filter can
    // test it directly.
    ongoing: event.ongoing ? 1 : 0,
    reasons: JSON.stringify(reasons),
    signals: JSON.stringify(signals),
  };
  db.prepare(`
    INSERT INTO candidates (${CANDIDATE_COLUMNS.join(', ')}, firstSeenAt, lastSeenAt)
    VALUES (${CANDIDATE_COLUMNS.map((column) => `$${column}`).join(', ')}, $at, $at)
    ON CONFLICT(id) DO UPDATE SET
      ${CANDIDATE_COLUMNS.filter((column) => column !== 'id').map((column) => `${column} = excluded.${column}`).join(', ')},
      lastSeenAt = excluded.lastSeenAt
  `).run({ ...values, at });
  return objectType;
}

/** Record a decision. Idempotent per candidate; re-deciding overwrites. */
export function decide(db, candidateId, { state, decidedBy = 'human', reason = null, note = null, now } = {}) {
  if (!STATES.includes(state)) throw new Error(`unknown state: ${state}`);
  db.prepare(`
    INSERT INTO decisions (candidateId, state, decidedBy, reason, note, decidedAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(candidateId) DO UPDATE SET
      state = excluded.state, decidedBy = excluded.decidedBy,
      reason = excluded.reason, note = excluded.note, decidedAt = excluded.decidedAt
  `).run(candidateId, state, decidedBy, reason, note, (now ?? new Date()).toISOString());
}

/** Withdraw a decision, returning the candidate to pending. */
export function undecide(db, candidateId) {
  db.prepare('DELETE FROM decisions WHERE candidateId = ?').run(candidateId);
}

const HYDRATE = `
  SELECT c.*, d.state, d.decidedBy, d.reason AS decisionReason, d.note AS decisionNote, d.decidedAt
  FROM candidates c LEFT JOIN decisions d ON d.candidateId = c.id
`;

const hydrate = (row) => ({
  ...row,
  ongoing: Boolean(row.ongoing),
  reasons: JSON.parse(row.reasons || '[]'),
  signals: JSON.parse(row.signals || '[]'),
  // No decision row means nobody has ruled on it yet.
  state: row.state || 'pending',
});

/**
 * Read the pool.
 *
 * @param {object} filters  state / objectType / source; omit for everything
 */
export function listCandidates(db, { state, objectType, source, horizonDays, now } = {}) {
  const where = [];
  const params = {};
  // `state` lives in the join, so pending must be asked for as "no decision".
  if (state === 'pending') where.push('d.state IS NULL');
  else if (state) { where.push('d.state = $state'); params.state = state; }
  if (objectType) { where.push('c.objectType = $objectType'); params.objectType = objectType; }
  if (source) { where.push('c.source = $source'); params.source = source; }
  if (horizonDays) {
    const at = now ?? new Date();
    params.today = at.toISOString().slice(0, 10);
    params.cutoff = new Date(at.getTime() + horizonDays * 86400000).toISOString().slice(0, 10);
    // Still running, and not further out than the horizon.
    //
    // `ongoing` is the "runs until further notice" case: a source that says
    // 「開催：2026年1月29日〜」 with no end, or a shop, which has no end at all.
    // Without it, a missing endDate reads as "single-day event" and the thing
    // silently ages out of the back office while still being open — see the
    // comment in scripts/sources/scrap.mjs.
    where.push('(c.ongoing = 1 OR COALESCE(c.endDate, c.startDate) >= $today) AND c.startDate <= $cutoff');
  }
  const sql = `${HYDRATE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.startDate, c.id`;
  return db.prepare(sql).all(params).map(hydrate);
}

export function getCandidate(db, id) {
  const row = db.prepare(`${HYDRATE} WHERE c.id = ?`).get(id);
  return row ? hydrate(row) : null;
}

/** Counts for the back office header: how much is waiting, of what. */
export function poolSummary(db) {
  const byState = Object.fromEntries(db.prepare(`
    SELECT COALESCE(d.state, 'pending') AS state, COUNT(*) AS n
    FROM candidates c LEFT JOIN decisions d ON d.candidateId = c.id
    GROUP BY 1
  `).all().map((row) => [row.state, row.n]));
  const byType = db.prepare(`
    SELECT c.objectType AS objectType, COALESCE(d.state, 'pending') AS state, COUNT(*) AS n
    FROM candidates c LEFT JOIN decisions d ON d.candidateId = c.id
    GROUP BY 1, 2
  `).all();
  const bySource = db.prepare(`
    SELECT c.source AS source, COALESCE(d.state, 'pending') AS state, COUNT(*) AS n
    FROM candidates c LEFT JOIN decisions d ON d.candidateId = c.id
    GROUP BY 1, 2 ORDER BY 3 DESC
  `).all();
  return {
    total: db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n,
    pending: byState.pending || 0,
    published: byState.published || 0,
    rejected: byState.rejected || 0,
    byType,
    bySource,
  };
}

/** Candidates first seen at or after `since` — "what arrived in this run". */
export function newSince(db, since) {
  return db.prepare(`${HYDRATE} WHERE c.firstSeenAt >= ? ORDER BY c.startDate`).all(since).map(hydrate);
}
