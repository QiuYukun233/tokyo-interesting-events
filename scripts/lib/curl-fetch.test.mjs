import test from 'node:test';
import assert from 'node:assert/strict';
import { curlArgs, curlFetch, splitResponse } from './curl-fetch.mjs';

test('the argv carries our own User-Agent as a normal header, not a browser disguise', () => {
  const args = curlArgs('https://example.test/x', { headers: { 'user-agent': 'TokyoInterestingEvents/0.6' } });
  const headerIndex = args.indexOf('--header');
  assert.equal(args[headerIndex + 1], 'user-agent: TokyoInterestingEvents/0.6');
  assert.ok(!args.some((arg) => /Mozilla|Chrome|Safari/.test(arg)), 'must never pose as a browser');
});

test('redirects are followed by default and can be turned off', () => {
  assert.ok(curlArgs('https://example.test/').includes('--location'));
  assert.ok(!curlArgs('https://example.test/', { redirect: 'manual' }).includes('--location'));
});

test('the status code is requested as a trailing sentinel and the URL comes last', () => {
  const args = curlArgs('https://example.test/x');
  assert.equal(args.at(-1), 'https://example.test/x');
  assert.equal(args.at(-2), '\n%{http_code} %{redirect_url}');
  assert.equal(args.at(-3), '--write-out');
});

test('a timeout is always set so a hung request cannot stall a collector', () => {
  assert.equal(curlArgs('https://example.test/', { timeoutSeconds: 5 })[curlArgs('https://example.test/').indexOf('--max-time') + 1], '5');
  assert.ok(curlArgs('https://example.test/').includes('--max-time'));
});

test('body and status are split off the sentinel, including when the body has newlines', () => {
  assert.deepEqual(splitResponse('<html>\n<body>hi</body>\n</html>\n200 '),
    { body: '<html>\n<body>hi</body>\n</html>', status: 200, redirectUrl: null });
});

test('a redirect reports where it was going — how an unpublished edition is detected', () => {
  assert.deepEqual(splitResponse('\n302 https://c.bunfree.net/'),
    { body: '', status: 302, redirectUrl: 'https://c.bunfree.net/' });
});

test('an empty body still yields a usable status', () => {
  assert.equal(splitResponse('\n403 ').status, 403);
  assert.equal(splitResponse('404').status, 404);
});

test('curlFetch reads a local file, proving the spawn and the split wire up', async () => {
  const { writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'curl-fetch-'));
  const file = join(dir, 'page.html');
  await writeFile(file, '<html>hello</html>\n');
  const response = await curlFetch(`file://${file.replace(/\\/g, '/')}`);
  assert.equal(typeof response.status, 'number');
  assert.match(await response.text(), /hello/);
});
