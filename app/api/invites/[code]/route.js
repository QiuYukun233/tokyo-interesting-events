import { cloudClient, errorResponse } from '../../_client.js';
import { inviteView, replyToInvite } from '../../../../lib/cloud-api.mjs';

// No QUEUE_TOKEN here on purpose (朋友投票设计 §4): the code in the URL is
// the credential, and it unlocks this one invite and nothing else.

export async function GET(request, { params }) {
  const { code } = await params;
  const responderId = new URL(request.url).searchParams.get('responder') || null;
  const client = cloudClient();
  try {
    return Response.json(await inviteView(client, code, { responderId }));
  } catch (error) {
    return errorResponse(error);
  } finally {
    client.close();
  }
}

export async function POST(request, { params }) {
  const { code } = await params;
  const body = await request.json().catch(() => ({}));
  const client = cloudClient();
  try {
    return Response.json(await replyToInvite(client, code, {
      responderId: body.responderId, name: body.name, vote: body.vote,
    }));
  } catch (error) {
    return errorResponse(error);
  } finally {
    client.close();
  }
}
