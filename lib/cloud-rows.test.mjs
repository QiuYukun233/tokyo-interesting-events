import test from 'node:test';
import assert from 'node:assert/strict';
import { splitForCloud } from './cloud-rows.mjs';
import { CANDIDATE_COLUMNS } from './cloud-db.mjs';

const NOW = '2026-09-01T00:00:00+09:00';

function candidate(overrides = {}) {
  return {
    id: 'a', title: 'T', titleZh: null, place: null, time: null, price: null,
    startDate: '2026-09-10', endDate: null, ongoing: false, sourceUrl: 'https://x',
    source: 's', sourceFamily: 'f', changeType: null, popularity: null,
    description: null, tags: ['市集'], reasons: [], signals: [], state: 'pending',
    decidedBy: null, ...overrides,
  };
}

test('factually-eligible candidates become push rows with a locally computed score', () => {
  const rows = [
    candidate({ id: 'keep', signals: ['signal:theater'] }),
    candidate({ id: 'gone', state: 'rejected', decidedBy: 'human' }),
  ];
  const { pushRows, deleteIds } = splitForCloud(rows, { now: NOW });
  assert.deepEqual(pushRows.map((r) => r.id), ['keep']);
  assert.deepEqual(deleteIds, ['gone']);
  assert.equal(typeof pushRows[0].score, 'number');
});

test('score reflects evidence weights: a published-signal candidate outscores a bare one', () => {
  // 12 human decisions teach weightsFromEvidence that signal:x publishes at 100%.
  const teaching = Array.from({ length: 12 }, (_, i) =>
    candidate({ id: `t${i}`, state: 'published', decidedBy: 'human', signals: ['signal:x'] }));
  const rows = [...teaching,
    candidate({ id: 'strong', signals: ['signal:x'] }),
    candidate({ id: 'bare' })];
  const { pushRows } = splitForCloud(rows, { now: NOW });
  const byId = new Map(pushRows.map((r) => [r.id, r]));
  assert.ok(byId.get('strong').score > byId.get('bare').score);
});

test('push rows carry only cloud columns — no reasons/signals/decision fields leak', () => {
  const { pushRows } = splitForCloud([candidate({ id: 'a' })], { now: NOW });
  for (const forbidden of ['reasons', 'signals', 'state', 'decidedBy']) {
    assert.ok(!(forbidden in pushRows[0]), forbidden);
  }
  assert.deepEqual(pushRows[0].tags, ['市集']);
});

test('push rows carry exactly the mirror columns minus pushedAt — presence pinned, not just absence', () => {
  const { pushRows } = splitForCloud([candidate({ id: 'a' })], { now: NOW });
  const expected = CANDIDATE_COLUMNS.filter((c) => c !== 'pushedAt').sort();
  assert.deepEqual(Object.keys(pushRows[0]).sort(), expected);
});
