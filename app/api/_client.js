import { createClient } from '@libsql/client/web';
import { isAuthorized } from '../../lib/cloud-api.mjs';

/** Fetch-only libsql client — works in Workers and local dev alike. */
export function cloudClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not configured');
  return createClient({ url, authToken });
}

/** null when authorized, otherwise a ready 401 response. */
export function requireToken(request) {
  const ok = isAuthorized({
    cookie: request.headers.get('cookie'),
    authorization: request.headers.get('authorization'),
  }, process.env.QUEUE_TOKEN);
  return ok ? null : Response.json({ error: 'unauthorized' }, { status: 401 });
}
