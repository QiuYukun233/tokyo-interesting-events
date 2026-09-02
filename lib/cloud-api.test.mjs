import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { ensureCloudSchema, upsertCloudCandidates, deleteCloudCandidates, setSubscriptions } from './cloud-db.mjs';
import { currentRound, castVote, wantList, isAuthorized, getSubscriptions, saveSubscriptions } from './cloud-api.mjs';

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
  assert.deepEqual(first.likedTags, [], 'no votes yet means no liked tags');
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

test('currentRound on an empty mirror returns an empty round and persists nothing', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  const round = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(round.roundId, null);
  assert.deepEqual(round.items, []);
  const count = await client.execute('SELECT COUNT(*) AS n FROM rounds');
  assert.equal(Number(count.rows[0].n), 0, 'an empty round must not write a rounds row');
});

test('a candidate deleted from the mirror drops out of a resumed round', async (t) => {
  const client = memoryClient(t);
  await seed(client);
  const round = await currentRound(client, { now: NOW, size: 5 });
  const gone = round.items[1].id;
  await deleteCloudCandidates(client, [gone]);
  const resumed = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(resumed.roundId, round.roundId);
  assert.equal(resumed.items.length, 4);
  assert.ok(!resumed.items.some((item) => item.id === gone));
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

test('isAuthorized survives a malformed cookie and round-trips a URL-encoded token', () => {
  assert.ok(!isAuthorized({ cookie: 'queue_token=%', authorization: null }, 'shhh'),
    'malformed percent-encoding must fail auth, not throw');
  const secret = 'sh h/h+分';
  assert.ok(isAuthorized({ cookie: `queue_token=${encodeURIComponent(secret)}`, authorization: null }, secret));
});

test('currentRound draws mostly from subscribed tags and reports them', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [
    ...Array.from({ length: 20 }, (_, i) => row(`play-${i}`, { sourceFamily: `pf-${i}`, score: 2, tags: ['演剧'] })),
    ...Array.from({ length: 6 }, (_, i) => row(`night-${i}`, { sourceFamily: `nf-${i}`, score: 0.1, tags: ['深夜'] })),
  ], { now: NOW });
  await setSubscriptions(client, ['深夜'], { now: NOW });
  const round = await currentRound(client, { now: NOW, size: 9 });
  assert.deepEqual(round.subscribedTags, ['深夜']);
  const nights = round.items.filter((i) => i.tags.includes('深夜')).length;
  assert.ok(nights >= 5, `subscribed tag should dominate, got ${nights}/9`);
  assert.ok(round.items.some((i) => !i.tags.includes('深夜')), 'soft mix-in survives');
});

test('saveSubscriptions keeps only vocabulary tags and round-trips via getSubscriptions', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await saveSubscriptions(client, ['深夜', '不存在的tag', '怪奇'], { now: NOW });
  assert.deepEqual((await getSubscriptions(client)).sort(), ['怪奇', '深夜'].sort());
  await assert.rejects(() => saveSubscriptions(client, 'notanarray', { now: NOW }));
});

test('asking for a tag round while a different round is open abandons the old one', async (t) => {
  const client = memoryClient(t);
  await ensureCloudSchema(client);
  await upsertCloudCandidates(client, [
    row('a', { tags: ['深夜'] }), row('b', { tags: ['市集'] }), row('c', { tags: ['市集'] }),
  ], { now: NOW });
  const general = await currentRound(client, { now: NOW, size: 5 });
  assert.equal(general.tag, null);
  const themed = await currentRound(client, { now: NOW, size: 5, tag: '深夜' });
  assert.notEqual(themed.roundId, general.roundId, 'a tag request must not silently resume the general round');
  assert.equal(themed.tag, '深夜');
  assert.deepEqual(themed.items.map((i) => i.id), ['a']);
  const closed = await client.execute({ sql: 'SELECT closedAt FROM rounds WHERE id = ?', args: [general.roundId] });
  assert.ok(closed.rows[0].closedAt, 'the abandoned round is closed, not left dangling');
  const same = await currentRound(client, { now: NOW, size: 5, tag: '深夜' });
  assert.equal(same.roundId, themed.roundId, 'asking for the same tag again resumes it');
});

test('a resumed round reports the votes already cast on it', async (t) => {
  const client = memoryClient(t);
  await seed(client);
  const round = await currentRound(client, { now: NOW, size: 5 });
  assert.deepEqual(round.votedInRound, {});
  await castVote(client, { candidateId: round.items[0].id, vote: 'want', roundId: round.roundId, now: NOW });
  await castVote(client, { candidateId: round.items[1].id, vote: 'no', roundId: round.roundId, now: NOW });
  const resumed = await currentRound(client, { now: NOW, size: 5 });
  assert.deepEqual(resumed.votedInRound, { [round.items[0].id]: 'want', [round.items[1].id]: 'no' });
});
