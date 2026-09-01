import { cloudClient, requireToken } from '../_client.js';
import { currentRound } from '../../../lib/cloud-api.mjs';

export async function GET(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const tag = new URL(request.url).searchParams.get('tag') || null;
  const client = cloudClient();
  try {
    return Response.json(await currentRound(client, { tag }));
  } finally {
    client.close();
  }
}
