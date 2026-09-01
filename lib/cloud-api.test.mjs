import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { ensureCloudSchema, upsertCloudCandidates } from './cloud-db.mjs';
import { currentRound, castVote, wantList, isAuthorized } from './cloud-api.mjs';

const NOW = '2026-09-01T00:00:00+09:00';

function memoryClient(t) {
  const client = createClient({ url: ':memory:' });
  t.after(() => client.close());
  return client;
}

function row(id, overrides = {}) {
  return {
    id, title: id, titleZh: null, place: null, time: null, price: null,
    startDate: '2026-09-10', endDate: null, ongoing: false, sourceUrl: 'https://x/' + id,
    source: 's' + id, sourceFamily: 'f' + id, changeType: null, popularity: null,
    description: null, tags: ['市集'], score: 0.1, ...overrides,
  };
}

async function seed(client, count = 20) {
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client,
    Array.from({ length: count }, (_, i) => row(`c${String(i).padStart(2, '0')}`)), { now: NOW });
}

test('currentRound creates a round when none is open, then returns the same one', async (t) => {
  const client = memoryClient(t);
  await seed(client);
  const first = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(first.items.length, 5);
  assert.ok(first.items.every((item) => item.title && item.pickedFor));
  const again = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(again.roundId, first.roundId);
});

test('a fully-voted round closes and the next call opens a fresh one', async (t) => {
  const client = memoryClient(t);
  await seed(client);
  const round = await currentRound(client, { now: NOW, size: 5 });
  for (const item of round.items) {
    await castVote(client, { candidateId: item.id, vote: 'no', roundId: round.roundId, now: NOW });
  }
  const next = await currentRound(client, { now: NOW, size: 5 });
  assert.notEqual(next.roundId, round.roundId);
  const overlap = next.items.filter((item) => round.items.some((prev) => prev.id === item.id));
  assert.equal(overlap.length, 0, 'voted-no candidates must not reappear');
});

test('currentRound resumes a half-voted round showing only unvoted items', async (t) => {
  const client = memoryClient(t);
  await seed(client);
  const round = await currentRound(client, { now: NOW, size: 5 });
  await castVote(client, { candidateId: round.items[0].id, vote: 'want', roundId: round.roundId, now: NOW });
  const resumed = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(resumed.roundId, round.roundId);
  assert.equal(resumed.items.length, 4);
});

test('a tag round only contains candidates carrying that tag', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [
    row('a', { tags: ['深夜'] }), row('b', { tags: ['市集'] }), row('c', { tags: ['深夜', '怪奇'] }),
  ], { now: NOW });
  const round = await currentRound(client, { now: NOW, size: 5, tag: '深夜' });
  assert.deepEqual(round.items.map((i) => i.id).sort(), ['a', 'c']);
  assert.equal(round.tag, '深夜');
});

test('castVote validates its inputs', async (t) => {
  const client = memoryClient(t);
  await seed(client, 2);
  await assert.rejects(() => castVote(client, { candidateId: 'c00', vote: 'nope', roundId: 'r' }));
  await assert.rejects(() => castVote(client, { candidateId: '', vote: 'want', roundId: 'r' }));
});

test('wantList returns want-voted candidates ordered by soonest end', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [
    row('late', { startDate: '2026-10-01' }),
    row('soon', { startDate: '2026-09-03' }),
    row('meh'),
  ], { now: NOW });
  await castVote(client, { candidateId: 'late', vote: 'want', roundId: 'r', now: NOW });
  await castVote(client, { candidateId: 'soon', vote: 'want', roundId: 'r', now: NOW });
  await castVote(client, { candidateId: 'meh', vote: 'no', roundId: 'r', now: NOW });
  const list = await wantList(client);
  assert.deepEqual(list.map((r) => r.id), ['soon', 'late']);
});

test('isAuthorized compares token from cookie or bearer header, and fails closed', () => {
  const secret = 'shhh';
  assert.ok(isAuthorized({ cookie: `queue_token=${secret}`, authorization: null }, secret));
  assert.ok(isAuthorized({ cookie: null, authorization: `Bearer ${secret}` }, secret));
  assert.ok(!isAuthorized({ cookie: 'queue_token=wrong', authorization: null }, secret));
  assert.ok(!isAuthorized({ cookie: null, authorization: null }, secret));
  assert.ok(!isAuthorized({ cookie: `queue_token=${secret}`, authorization: null }, undefined));
  assert.ok(!isAuthorized({ cookie: `queue_token=${secret}`, authorization: null }, ''));
});
