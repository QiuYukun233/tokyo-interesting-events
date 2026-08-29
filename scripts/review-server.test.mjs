import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

/**
 * The review page's browser script is embedded in a template literal inside
 * review-server.mjs, so the server can be syntactically perfect while the page
 * it serves is broken — and a broken page fails **silently**: the list simply
 * renders nothing.
 *
 * That happened twice on 2026-08-30. Once a backtick inside a comment ended the
 * template early, which `node --check` caught because it broke the server file
 * too. Once an escaped newline in a client string became a real newline when
 * the template was evaluated: the server file stayed valid, every candidate
 * vanished from the page, and nothing anywhere reported an error.
 *
 * These tests parse the client script the way a browser would.
 */
const SOURCE = new URL('./review-server.mjs', import.meta.url);

/** The page is one template literal; pull the browser script out of it. */
async function clientScript() {
  const source = await readFile(SOURCE, 'utf8');
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length, 'no <script> block found — has the page been restructured?');
  return scripts.at(-1);
}

test('the browser script is syntactically valid', async () => {
  const script = await clientScript();
  assert.doesNotThrow(() => new vm.Script(script), 'the served page would render nothing');
});

test('no client string literal is broken across lines', async () => {
  // The specific failure: `' 条\n签名 '` written in the server file becomes a
  // literal newline inside a single-quoted client string.
  const script = await clientScript();
  const unescapedQuote = new RegExp(String.raw`(?<!\\)'`, 'g');
  for (const [index, line] of script.split('\n').entries()) {
    const quotes = (line.match(unescapedQuote) ?? []).length;
    assert.equal(quotes % 2, 0, `line ${index + 1} has an unclosed string: ${line.trim().slice(0, 80)}`);
  }
});

test('the sort switch the page needs is present, and the server feeds it', async () => {
  const source = await readFile(SOURCE, 'utf8');
  assert.match(source, /data-f="sort" data-v="learning"/);
  assert.match(source, /data-f="sort" data-v="likely"/);
  assert.match(source, /learningQueue/, 'the server must expose the queue the switch reads');
});
