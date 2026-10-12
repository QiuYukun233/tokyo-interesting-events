import { cloudClient, requireToken, errorResponse } from '../_client.js';
import { createInvite } from '../../../lib/cloud-api.mjs';

/** Inviter only: get (or create) the share code for a want-list item. */
export async function POST(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const client = cloudClient();
  try {
    return Response.json(await createInvite(client, { candidateId: body.candidateId }));
  } catch (error) {
    return errorResponse(error);
  } finally {
    client.close();
  }
}
