import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeEventRecord, validateEventRecord } from './event-contract.mjs';

test('normalizes optional editorial fields to null without inventing values', () => {
  const result = normalizeEventRecord({ id: 'x', title: '活动', imageUrl: '', why: '  ', description: '摘要' });
  assert.equal(result.imageUrl, null);
  assert.equal(result.why, null);
  assert.equal(result.description, '摘要');
});

test('rejects malformed required fields and optional field types', () => {
  const result = validateEventRecord({ id: 'x', startDate: 'tomorrow', title: '活动', imageUrl: 42 });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(';'), /startDate/);
  assert.match(result.errors.join(';'), /imageUrl/);
});

test('all current JSON events satisfy the core contract; optional metadata is sparse but valid', async () => {
  const data = JSON.parse(await readFile(new URL('../data/events.json', import.meta.url), 'utf8'));
  assert.ok(data.events.length > 0);
  const failures = data.events.flatMap((event) => validateEventRecord(event).errors.map((error) => `${event.id}: ${error}`));
  assert.deepEqual(failures, []);
  for (const event of data.events) {
    const normalized = normalizeEventRecord(event);
    for (const field of ['imageUrl', 'why', 'changeType', 'attribution', 'audience', 'description']) assert.ok(normalized[field] === null || typeof normalized[field] === 'string');
  }
});
