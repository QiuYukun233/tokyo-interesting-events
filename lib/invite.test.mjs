import test from 'node:test';
import assert from 'node:assert/strict';
import { newInviteCode, snapshotOf, validateReply, matchOf, MAX_NAME_LENGTH } from './invite.mjs';

test('invite codes are URL-safe and do not repeat', () => {
  const codes = new Set(Array.from({ length: 100 }, newInviteCode));
  assert.equal(codes.size, 100);
  for (const code of codes) assert.match(code, /^[A-Za-z0-9_-]{22}$/);
});

test('snapshot keeps display fields only and fills missing ones with null', () => {
  const snap = snapshotOf({ id: 'a', title: 'T', startDate: '2026-10-20', score: 3, source: 'x', tags: ['深夜'] });
  assert.deepEqual(snap, {
    id: 'a', title: 'T', titleZh: null, place: null, time: null, price: null,
    startDate: '2026-10-20', endDate: null, sourceUrl: null, tags: ['深夜'],
  });
});

test('validateReply trims the name and rejects bad input', () => {
  const ok = { responderId: 'abcdefgh12', name: '  小王 ', vote: 'want' };
  assert.deepEqual(validateReply(ok), { responderId: 'abcdefgh12', name: '小王', vote: 'want' });
  assert.throws(() => validateReply({ ...ok, responderId: 'short' }), /responderId/);
  assert.throws(() => validateReply({ ...ok, responderId: 'has space here' }), /responderId/);
  assert.throws(() => validateReply({ ...ok, name: '   ' }), /name is required/);
  assert.throws(() => validateReply({ ...ok, name: '字'.repeat(MAX_NAME_LENGTH + 1) }), /at most/);
  assert.throws(() => validateReply({ ...ok, vote: 'maybe' }), /vote must be/);
  assert.throws(() => validateReply(), /responderId/);
});

test('name length counts characters, not UTF-16 units', () => {
  assert.doesNotThrow(() => validateReply({ responderId: 'abcdefgh12', name: '🎌'.repeat(MAX_NAME_LENGTH), vote: 'ok' }));
});

test('matchOf follows the §7.3 grades and any no vetoes', () => {
  assert.equal(matchOf('want', 'want'), 'both_want');
  assert.equal(matchOf('want', 'ok'), 'can_go');
  assert.equal(matchOf('ok', 'want'), 'can_go');
  assert.equal(matchOf('ok', 'ok'), 'both_ok');
  assert.equal(matchOf('want', 'no'), 'no_match');
  assert.equal(matchOf('no', 'want'), 'no_match');
  assert.equal(matchOf(undefined, 'want'), null);
  assert.equal(matchOf('want', null), null);
});
