import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  ensureCloudSchema, upsertCloudCandidates, deleteCloudCandidates, listCloudCandidates,
  recordVote, latestVotes, votesWithTags, saveRound, openRound, closeRound,
  listSubscriptions, setSubscriptions,
} from './cloud-db.mjs';

// In-memory rather than a temp file: on Windows the libsql native binding keeps
// the db file handle open until process exit, so a file-backed test dir can
// never be cleaned up (EBUSY). Behavior under test is identical.
function memoryClient(t) {
  const client = createClient({ url: ':memory:' });
  t.after(() => { client.close(); });
  return client;
}

const ROW = {
  id: 'a', title: 'Night market', titleZh: '夜市', place: '上野', time: '18:00',
  price: '免费', startDate: '2026-09-05', endDate: null, ongoing: false,
  sourceUrl: 'https://example.com/a', source: 'demo', sourceFamily: 'market',
  changeType: null, popularity: 3, description: 'desc',
  tags: ['深夜', '市集'], score: 0.42,
};

test('ensureCloudSchema is idempotent', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await ensureCloudSchema(client);
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const names = tables.rows.map((r) => r.name);
  for (const expected of ['candidates', 'votes', 'rounds']) assert.ok(names.includes(expected), expected);
});

test('upsert then list round-trips a candidate, JSON and booleans intact', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [ROW], { now: '2026-09-01T00:00:00Z' });
  const rows = await listCloudCandidates(client);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'a');
  assert.deepEqual(rows[0].tags, ['深夜', '市集']);
  assert.equal(rows[0].ongoing, false);
  assert.equal(rows[0].score, 0.42);
  assert.equal(rows[0].state, 'pending');
  assert.equal(rows[0].pushedAt, '2026-09-01T00:00:00.000Z');
});

test('upserting more rows than one batch chunk lands them all', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  const rows = Array.from({ length: 60 }, (_, i) => ({ ...ROW, id: `id-${i}` }));
  await upsertCloudCandidates(client, rows, { now: '2026-09-01T00:00:00Z' });
  const listed = await listCloudCandidates(client);
  assert.equal(listed.length, 60);
});

test('re-upsert replaces fields instead of duplicating', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [ROW], { now: '2026-09-01T00:00:00Z' });
  await upsertCloudCandidates(client, [{ ...ROW, score: 0.9, tags: ['市集'] }], { now: '2026-09-02T00:00:00Z' });
  const rows = await listCloudCandidates(client);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 0.9);
  assert.deepEqual(rows[0].tags, ['市集']);
});

test('deleteCloudCandidates removes hard-excluded ids and tolerates unknown ids', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [ROW, { ...ROW, id: 'b' }], { now: '2026-09-01T00:00:00Z' });
  await deleteCloudCandidates(client, ['a', 'never-existed']);
  const rows = await listCloudCandidates(client);
  assert.deepEqual(rows.map((r) => r.id), ['b']);
});

test('recordVote upserts: a re-vote overwrites the previous vote', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await recordVote(client, { candidateId: 'a', vote: 'ok', roundId: 'r1', now: '2026-09-01T10:00:00Z' });
  await recordVote(client, { candidateId: 'a', vote: 'want', roundId: 'r2', now: '2026-09-02T10:00:00Z' });
  const votes = await latestVotes(client);
  assert.equal(votes.size, 1);
  assert.equal(votes.get('a').vote, 'want');
  assert.equal(votes.get('a').votedAt, '2026-09-02T10:00:00.000Z');
});

test('recordVote rejects an invalid vote value', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await assert.rejects(() => recordVote(client, { candidateId: 'a', vote: 'maybe', roundId: 'r1' }), /CHECK/i);
});

test('votesWithTags keeps a vote whose candidate left the mirror, with empty tags', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [ROW], { now: '2026-09-01T00:00:00Z' });
  await recordVote(client, { candidateId: 'a', vote: 'want', roundId: 'r1', now: '2026-09-01T10:00:00Z' });
  await deleteCloudCandidates(client, ['a']);
  assert.deepEqual(await votesWithTags(client), [{ vote: 'want', tags: [] }]);
});

test('votesWithTags joins each vote with its candidate tags for tagWeightsFromVotes', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [ROW, { ...ROW, id: 'b', tags: ['运动'] }], { now: '2026-09-01T00:00:00Z' });
  await recordVote(client, { candidateId: 'a', vote: 'want', roundId: 'r1', now: '2026-09-01T10:00:00Z' });
  await recordVote(client, { candidateId: 'b', vote: 'no', roundId: 'r1', now: '2026-09-01T10:01:00Z' });
  const joined = await votesWithTags(client);
  joined.sort((x, y) => x.vote.localeCompare(y.vote));
  assert.deepEqual(joined, [
    { vote: 'no', tags: ['运动'] },
    { vote: 'want', tags: ['深夜', '市集'] },
  ]);
});

test('saveRound/openRound/closeRound manage the single open round', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  assert.equal(await openRound(client), null);
  await saveRound(client, { id: 'r1', tag: null, items: [{ id: 'a', pickedFor: 'nowness' }], now: '2026-09-01T00:00:00Z' });
  const open = await openRound(client);
  assert.equal(open.id, 'r1');
  assert.deepEqual(open.items, [{ id: 'a', pickedFor: 'nowness' }]);
  await closeRound(client, 'r1', { now: '2026-09-02T00:00:00Z' });
  assert.equal(await openRound(client), null);
});

test('subscriptions replace as a whole and round-trip', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  assert.deepEqual(await listSubscriptions(client), []);
  await setSubscriptions(client, ['深夜', '怪奇'], { now: '2026-09-01T00:00:00Z' });
  assert.deepEqual((await listSubscriptions(client)).sort(), ['怪奇', '深夜'].sort());
  await setSubscriptions(client, ['市集'], { now: '2026-09-02T00:00:00Z' });
  assert.deepEqual(await listSubscriptions(client), ['市集']);
  await setSubscriptions(client, [], { now: '2026-09-03T00:00:00Z' });
  assert.deepEqual(await listSubscriptions(client), []);
});
