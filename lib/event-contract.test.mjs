import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeEventRecord, validateEventRecord } from './event-contract.mjs';

test('normalizes optional metadata to null', () => {
  const event = normalizeEventRecord({ id: 'x', imageUrl: '', why: '  ', description: '摘要' });
  assert.equal(event.imageUrl, null); assert.equal(event.why, null); assert.equal(event.description, '摘要');
});

test('rejects malformed required fields and optional types', () => {
  const result = validateEventRecord({ id: 'x', startDate: 'tomorrow', title: '活动', imageUrl: 42 });
  assert.equal(result.valid, false); assert.match(result.errors.join(';'), /startDate/); assert.match(result.errors.join(';'), /imageUrl/);
});

test('all current events satisfy the core contract and optional fields are safe', async () => {
  const data = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
  const failures = data.events.flatMap((event) => validateEventRecord(event).errors.map((error) => `${event.id}: ${error}`));
  assert.deepEqual(failures, []);
  for (const event of data.events) for (const field of ['imageUrl', 'why', 'changeType', 'attribution', 'audience', 'description']) assert.ok(normalizeEventRecord(event)[field] === null || typeof normalizeEventRecord(event)[field] === 'string');
});

test('popularity is optional but must be a non-negative number when present', () => {
  const base = { id: 'a', startDate: '2026-09-10', title: 't', titleZh: 't', place: 'p', time: 'x', price: 'y', vibe: 'v', sourceUrl: 'https://x' };
  assert.equal(validateEventRecord(base).valid, true);
  assert.equal(validateEventRecord({ ...base, popularity: 12 }).valid, true);
  assert.equal(validateEventRecord({ ...base, popularity: '12' }).valid, false);
  assert.equal(validateEventRecord({ ...base, popularity: -1 }).valid, false);
});
