/**
 * Thin access layer for the Turso mirror (docs/探索队列设计.md §2).
 * Every function takes a libsql client so tests can inject a local file:
 * database; production callers pass a client built from the Turso env credentials.
 *
 * The mirror is an EXPORT TARGET, never a source of record for candidates —
 * push-cloud overwrites it freely. votes and rounds are the opposite: they
 * exist only here and never flow back into pool.db.
 */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS candidates (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    titleZh       TEXT,
    place         TEXT,
    time          TEXT,
    price         TEXT,
    startDate     TEXT NOT NULL,
    endDate       TEXT,
    ongoing       INTEGER NOT NULL DEFAULT 0,
    sourceUrl     TEXT,
    source        TEXT,
    sourceFamily  TEXT,
    changeType    TEXT,
    popularity    INTEGER,
    description   TEXT,
    tags          TEXT NOT NULL DEFAULT '[]',
    score         REAL NOT NULL DEFAULT 0,
    pushedAt      TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS votes (
    candidateId   TEXT PRIMARY KEY,
    vote          TEXT NOT NULL CHECK (vote IN ('want','ok','no')),
    votedAt       TEXT NOT NULL,
    roundId       TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id            TEXT PRIMARY KEY,
    createdAt     TEXT NOT NULL,
    tag           TEXT,
    items         TEXT NOT NULL,
    closedAt      TEXT
  )`,
];

export async function ensureCloudSchema(client) {
  for (const sql of SCHEMA) await client.execute(sql);
}

// Chunked batches keep pushes to one round-trip per chunk instead of per row,
// while staying under HTTP request-size limits on real Turso.
const BATCH_CHUNK = 50;

async function batchInChunks(client, statements) {
  for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
    await client.batch(statements.slice(i, i + BATCH_CHUNK), 'write');
  }
}

const CANDIDATE_COLUMNS = ['id', 'title', 'titleZh', 'place', 'time', 'price', 'startDate', 'endDate',
  'ongoing', 'sourceUrl', 'source', 'sourceFamily', 'changeType', 'popularity', 'description',
  'tags', 'score', 'pushedAt'];

export async function upsertCloudCandidates(client, rows, { now } = {}) {
  const pushedAt = new Date(now ?? Date.now()).toISOString();
  const placeholders = CANDIDATE_COLUMNS.map(() => '?').join(', ');
  const updates = CANDIDATE_COLUMNS.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO candidates (${CANDIDATE_COLUMNS.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET ${updates}`;
  const statements = rows.map((row) => ({
    sql,
    args: CANDIDATE_COLUMNS.map((column) => {
      if (column === 'pushedAt') return pushedAt;
      if (column === 'ongoing') return row.ongoing ? 1 : 0;
      if (column === 'tags') return JSON.stringify(row.tags ?? []);
      if (column === 'score') return row.score ?? 0;
      return row[column] ?? null;
    }),
  }));
  await batchInChunks(client, statements);
}

export async function deleteCloudCandidates(client, ids = []) {
  if (!ids.length) return;
  const statements = ids.map((id) => ({ sql: 'DELETE FROM candidates WHERE id = ?', args: [id] }));
  await batchInChunks(client, statements);
}

/** Rows come back queue-ready: tags parsed, ongoing a boolean, state pinned to 'pending' (the mirror never holds rejected rows). */
export async function listCloudCandidates(client) {
  const result = await client.execute('SELECT * FROM candidates');
  return result.rows.map((row) => ({
    ...row,
    ongoing: Boolean(row.ongoing),
    tags: JSON.parse(row.tags ?? '[]'),
    state: 'pending',
  }));
}
