import { cloudClient, requireToken } from '../_client.js';
import { getSubscriptions, saveSubscriptions } from '../../../lib/cloud-api.mjs';

export async function GET(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const client = cloudClient();
  try {
    return Response.json({ tags: await getSubscriptions(client) });
  } finally {
    client.close();
  }
}

export async function PUT(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const client = cloudClient();
  try {
    await saveSubscriptions(client, body.tags);
    return Response.json({ tags: await getSubscriptions(client) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  } finally {
    client.close();
  }
}
