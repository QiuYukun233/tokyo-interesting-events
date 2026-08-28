import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * A `fetch`-shaped wrapper around the `curl` binary.
 *
 * Why this exists, precisely: 文学フリマ's catalogue sits behind Cloudflare,
 * which refuses Node's built-in fetch on client fingerprint alone. Measured
 * 2026-08-28 from one machine, one address, one moment, one User-Agent:
 * `curl` → 200, `node:fetch` → 403. Neither the UA nor the IP differed.
 *
 * What this is NOT: it does not impersonate a browser. We keep sending this
 * project's own descriptive User-Agent, we obey robots.txt, and we obey the
 * site's stated access rules (its 利用規約 blocks non-Japanese IPs, anonymous
 * proxies and VPNs — so these collectors are run from a Japanese connection
 * rather than routed around). curl is simply another ordinary HTTP client.
 * Forging a browser TLS fingerprint would be a different thing, and is not
 * done anywhere in this repo.
 *
 * Use it only for sources documented as needing it; everything else uses the
 * platform `fetch`.
 */

/** Build the argv for one request. Separated out so it is testable without spawning. */
export function curlArgs(url, { headers = {}, redirect = 'follow', timeoutSeconds = 60 } = {}) {
  const args = ['--silent', '--show-error', '--max-time', String(timeoutSeconds)];
  if (redirect === 'follow') args.push('--location');
  for (const [name, value] of Object.entries(headers)) args.push('--header', `${name}: ${value}`);
  // The body is followed by a sentinel line carrying the status code and, when
  // redirects are not followed, the Location it would have gone to. One
  // invocation yields all three without a second request or a temp file.
  args.push('--write-out', '\n%{http_code} %{redirect_url}', url);
  return args;
}

/** Split curl's combined output back into body, status and redirect target. */
export function splitResponse(stdout = '') {
  const cut = stdout.lastIndexOf('\n');
  const body = cut === -1 ? '' : stdout.slice(0, cut);
  const [code, location = ''] = (cut === -1 ? stdout : stdout.slice(cut + 1)).trim().split(/\s+/);
  return { body, status: Number(code) || 0, redirectUrl: location || null };
}

/**
 * @param {string} url
 * @param {{headers?: Record<string,string>, redirect?: 'follow'|'manual', timeoutSeconds?: number}} [options]
 * @returns {Promise<{status: number, ok: boolean, redirectUrl: string|null, text: () => Promise<string>, json: () => Promise<any>}>}
 */
export async function curlFetch(url, options = {}) {
  const { stdout } = await run('curl', curlArgs(String(url), options), {
    maxBuffer: 64 * 1024 * 1024, // the catalogue's all-exhibitors page is ~1.6MB; leave headroom
    encoding: 'utf8',
  });
  const { body, status, redirectUrl } = splitResponse(stdout);
  return {
    status,
    ok: status >= 200 && status < 300,
    redirectUrl,
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}
