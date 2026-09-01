import { cloudClient, requireToken } from '../_client.js';
import { wantList } from '../../../lib/cloud-api.mjs';

export async function GET(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const client = cloudClient();
  try {
    return Response.json({ items: await wantList(client) });
  } finally {
    client.close();
  }
}
