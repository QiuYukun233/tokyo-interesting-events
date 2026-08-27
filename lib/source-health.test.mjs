import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP_RATIO, FAILURE_STREAK_LIMIT, alertsForEntry, baselineCount, hasCriticalAlert, sourceId, updateEntry, updateRegistry } from './source-health.mjs';

const NOW = new Date('2026-08-28T12:00:00Z');
const source = { name: '東京都美術館', url: 'https://www.tobikan.jp/exhibition/', origin: 'https://www.tobikan.jp', sourceFamily: 'museum', trustTier: 'S0', parserVersion: '2026-08-28' };
const ok = (count) => ({ ok: true, count });
const runs = (counts) => counts.map((count, index) => ({ at: `2026-08-${10 + index}T00:00:00.000Z`, ok: true, count }));

const codesOf = (alerts) => alerts.map(({ code }) => code);

test('source id distinguishes same-named sources by URL', () => {
  assert.notEqual(
    sourceId({ name: '東京藝術大学大学美術館', url: 'https://museum.geidai.ac.jp/exhibit/main/' }),
    sourceId({ name: '東京藝術大学大学美術館', url: 'https://museum.geidai.ac.jp/exhibit/masaki/' }),
  );
});

test('a first run records the static registration and a clean streak', () => {
  const entry = updateEntry(undefined, source, ok(7), NOW);
  assert.equal(entry.trustTier, 'S0');
  assert.equal(entry.sourceFamily, 'museum');
  assert.equal(entry.failureStreak, 0);
  assert.equal(entry.lastSuccessAt, NOW.toISOString());
  assert.equal(entry.history.length, 1);
  assert.deepEqual(alertsForEntry(entry, NOW), []);
});

test('baseline ignores the run just folded in', () => {
  const entry = updateEntry({ history: runs([7, 7, 7]) }, source, ok(0), NOW);
  assert.equal(baselineCount(entry), 7);
});

test('a healthy source at its usual volume raises nothing', () => {
  const entry = updateEntry({ history: runs([7, 6, 8]) }, source, ok(7), NOW);
  assert.deepEqual(alertsForEntry(entry, NOW), []);
});

test('parsing zero against a solid baseline is critical, not "no events today"', () => {
  const entry = updateEntry({ history: runs([7, 7, 7]) }, source, ok(0), NOW);
  const alerts = alertsForEntry(entry, NOW);
  assert.deepEqual(codesOf(alerts), ['empty_parse']);
  assert.equal(alerts[0].level, 'critical');
});

test('parsing zero at a venue that is usually near-empty is only a warning', () => {
  const entry = updateEntry({ history: runs([1, 0, 1]) }, source, ok(0), NOW);
  const alerts = alertsForEntry(entry, NOW);
  assert.deepEqual(codesOf(alerts), ['empty_parse']);
  assert.equal(alerts[0].level, 'warning');
});

test('a source with no history yet cannot trigger a count alert', () => {
  assert.deepEqual(alertsForEntry(updateEntry(undefined, source, ok(0), NOW), NOW), []);
});

test('a count below half the baseline is a drop', () => {
  const entry = updateEntry({ history: runs([20, 20, 20]) }, source, ok(20 * DROP_RATIO - 1), NOW);
  assert.deepEqual(codesOf(alertsForEntry(entry, NOW)), ['count_drop']);
});

test('a single failure warns; a sustained streak escalates', () => {
  const first = updateEntry({ history: runs([7]) }, source, { ok: false, count: 0, error: '503' }, NOW);
  assert.equal(first.failureStreak, 1);
  assert.deepEqual(codesOf(alertsForEntry(first, NOW)), ['fetch_failed']);

  const streak = updateEntry({ failureStreak: FAILURE_STREAK_LIMIT - 1, history: runs([7]) }, source, { ok: false, count: 0, error: '503' }, NOW);
  const alerts = alertsForEntry(streak, NOW);
  assert.deepEqual(codesOf(alerts), ['fetch_failed_repeatedly']);
  assert.equal(alerts[0].level, 'critical');
});

test('a failure preserves the previous success timestamp', () => {
  const entry = updateEntry({ lastSuccessAt: '2026-08-20T00:00:00.000Z', history: runs([7]) }, source, { ok: false, count: 0, error: '403' }, NOW);
  assert.equal(entry.lastSuccessAt, '2026-08-20T00:00:00.000Z');
});

test('a source silent past its expected window goes stale', () => {
  const weekly = { ...source, expectedUpdateWindowDays: 7 };
  const entry = updateEntry({ lastSuccessAt: '2026-08-01T00:00:00.000Z', history: runs([7]) }, weekly, { ok: false, count: 0, error: 'timeout' }, NOW);
  assert.ok(codesOf(alertsForEntry(entry, NOW)).includes('stale'));
});

test('an unreachable robots.txt is surfaced rather than swallowed', () => {
  const entry = updateEntry(undefined, source, { ok: true, count: 3, robotsUnavailable: true }, NOW);
  assert.deepEqual(codesOf(alertsForEntry(entry, NOW)), ['robots_unavailable']);
});

test('history is capped and the registry folds every source', () => {
  const long = { history: runs(Array.from({ length: 30 }, () => 7)) };
  assert.ok(updateEntry(long, source, ok(7), NOW).history.length <= 14);

  const registry = updateRegistry({ entries: [] }, [source], [ok(7)], NOW);
  assert.equal(registry.entries.length, 1);
  assert.equal(hasCriticalAlert(registry), false);
});

test('registry carries a source forward across runs by id', () => {
  const first = updateRegistry({ entries: [] }, [source], [ok(7)], NOW);
  const second = updateRegistry(first, [source], [ok(7)], new Date('2026-08-29T12:00:00Z'));
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].history.length, 2);
});
