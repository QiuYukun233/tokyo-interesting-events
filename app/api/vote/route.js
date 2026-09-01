import { cloudClient, requireToken } from '../_client.js';
import { castVote } from '../../../lib/cloud-api.mjs';

export async function POST(request) {
  const denied = requireToken(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const client = cloudClient();
  try {
    await castVote(client, { candidateId: body.candidateId, vote: body.vote, roundId: body.roundId ?? null });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  } finally {
    client.close();
  }
}
