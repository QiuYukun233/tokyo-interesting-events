import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * 决策记录/0004 as an executable check.
 *
 * The ESLint rule in eslint.config.js covers the negative half — a collector
 * must not write data/events.json. This covers the positive half, which lint
 * cannot express: a collector must actually put what it finds into the pool.
 *
 * The failure this exists to catch is not a crash. `collect-shop-changes.mjs`
 * ran green for weeks while its output was discarded by the next export: exit
 * code 0, a plausible log line, all tests passing. Nothing anywhere asserted
 * that a collector's findings reach `data/pool.db`, so nothing noticed.
 */
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url));

async function collectorSources() {
  const names = (await readdir(SCRIPTS)).filter((name) => /^collect-.*\.mjs$/.test(name));
  return Promise.all(names.map(async (name) => ({ name, code: await readFile(new URL(name, import.meta.url), 'utf8') })));
}

/** Strip comments so a doc comment describing the old behaviour is not a match. */
const withoutComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('there is at least one collector to check, so this file cannot pass vacuously', async () => {
  const collectors = await collectorSources();
  assert.ok(collectors.length >= 5, `expected the collect-*.mjs family, found ${collectors.length}`);
});

test('every collector writes its findings to the candidate pool', async () => {
  for (const { name, code } of await collectorSources()) {
    const body = withoutComments(code);
    assert.match(body, /upsertCandidate\s*\(/, `${name} never calls upsertCandidate — its output goes nowhere durable (决策记录/0004)`);
    assert.match(body, /from\s+['"][^'"]*lib\/pool-db\.mjs['"]/, `${name} does not import lib/pool-db.mjs (决策记录/0004)`);
  }
});

test('no collector writes the export products', async () => {
  // Mirrors the ESLint rule so the invariant still holds if lint is skipped.
  for (const { name, code } of await collectorSources()) {
    const body = withoutComments(code);
    assert.doesNotMatch(body, /events\.json/, `${name} references an export product; only export-site may write those (决策记录/0004)`);
  }
});

test('no collector decides publication for itself', async () => {
  // A collector may not write a decisions row. Automatic judgement belongs in
  // lib/gate.mjs, where 决策记录/0002's evidence bar applies.
  for (const { name, code } of await collectorSources()) {
    const body = withoutComments(code);
    assert.doesNotMatch(body, /\bdecide\s*\(/, `${name} writes a decision; that belongs to a human or lib/gate.mjs (决策记录/0004)`);
    assert.doesNotMatch(body, /['"]published['"]/, `${name} names the published state; collectors leave everything pending (决策记录/0004)`);
  }
});
