/**
 * Queue orchestration between the cloud tables and the pure engine
 * (lib/queue.mjs). Route handlers stay dumb: parse request → call one
 * function here → serialize. All round state lives in the rounds table
 * (设计 §2.6); this module holds none.
 */
import { randomUUID } from 'node:crypto';
import { buildRound, tagWeightsFromVotes } from './queue.mjs';
import {
  listCloudCandidates, latestVotes, votesWithTags,
  recordVote, saveRound, openRound, closeRound,
  listSubscriptions, setSubscriptions,
} from './cloud-db.mjs';
import { TAG_VOCABULARY } from './tag-vocabulary.mjs';

const VOTES = new Set(['want', 'ok', 'no']);

/** User-facing "why recommended" tags (设计 §4): the positive weights only. */
function likedTagsFrom(tagWeights) {
  return [...tagWeights].filter(([, w]) => w > 0).map(([t]) => t);
}

/**
 * The Steam rule: one open round at a time. Returns the open round's unvoted
 * remainder, or builds and persists a new round when none is open. A round
 * whose every item is voted is closed on the fly.
 *
 * An explicit tag request is a request for a *different* round: if the open
 * round carries another tag (or none), it is abandoned — closed with its
 * unvoted items simply returning to the pool — rather than silently resumed,
 * which on the phone looked like a dead button. A null tag never abandons
 * anything: "next round" after a themed round just continues it.
 *
 * Concurrency note: two overlapping calls can both find no open round and
 * both save one. That race is benign — they build from identical vote state
 * and buildRound is deterministic, so the two rounds are identical; openRound
 * picks the newest, and the orphan's remainder empties under the same votes
 * and gets closed on the next call. This relies on buildRound staying
 * deterministic (no randomness).
 */
export async function currentRound(client, { now, size = 15, tag = null } = {}) {
  const votes = await latestVotes(client);
  const open = await openRound(client);
  if (open) {
    const remaining = open.items.filter((item) => !votes.has(item.id));
    const switching = tag !== null && (open.tag ?? null) !== tag;
    if (remaining.length && !switching) return await hydrateRound(client, open, remaining, votes);
    await closeRound(client, open.id, { now });
  }
  const candidates = await listCloudCandidates(client);
  const tagWeights = tagWeightsFromVotes(await votesWithTags(client));
  const subscribedTags = await listSubscriptions(client);
  const picked = buildRound(candidates, { now, size, tag, votesById: votes, tagWeights, subscribedTags });
  const round = { id: randomUUID(), tag, items: picked.map(({ id, pickedFor }) => ({ id, pickedFor })) };
  if (picked.length) await saveRound(client, { ...round, now });
  return {
    roundId: picked.length ? round.id : null,
    tag,
    items: picked,
    likedTags: likedTagsFrom(tagWeights),
    subscribedTags,
    votedInRound: {},
  };
}

/** {candidateId: vote} for the round's already-voted items — lets a reloaded page tally the whole round. */
function votedInRound(open, votes) {
  return Object.fromEntries(open.items.filter((item) => votes.has(item.id)).map((item) => [item.id, votes.get(item.id).vote]));
}

async function hydrateRound(client, open, remainingItems, votes) {
  const candidates = await listCloudCandidates(client);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const tagWeights = tagWeightsFromVotes(await votesWithTags(client));
  return {
    roundId: open.id,
    tag: open.tag,
    // A candidate deleted from the mirror since the round was built just drops out.
    items: remainingItems.map((item) => byId.has(item.id) ? { ...byId.get(item.id), pickedFor: item.pickedFor } : null).filter(Boolean),
    likedTags: likedTagsFrom(tagWeights),
    subscribedTags: await listSubscriptions(client),
    votedInRound: votedInRound(open, votes),
  };
}

export async function castVote(client, { candidateId, vote, roundId = null, now } = {}) {
  if (!candidateId || typeof candidateId !== 'string') throw new Error('candidateId is required');
  if (!VOTES.has(vote)) throw new Error(`vote must be one of ${[...VOTES].join('/')}`);
  await recordVote(client, { candidateId, vote, roundId, now });
}

/** want-voted candidates, soonest deadline first (设计 §5: 临期高亮). */
export async function wantList(client) {
  const votes = await latestVotes(client);
  const candidates = await listCloudCandidates(client);
  return candidates
    .filter((c) => votes.get(c.id)?.vote === 'want')
    .map((c) => ({ ...c, votedAt: votes.get(c.id).votedAt }))
    .sort((a, b) => String(a.endDate ?? a.startDate).localeCompare(String(b.endDate ?? b.startDate)));
}

/**
 * Single-token auth (设计 §5). Fails closed: no configured secret means no
 * access, never open access. `headers` is a plain object so this stays a pure
 * function — route handlers extract from the real Request.
 */
export function isAuthorized({ cookie, authorization } = {}, secret) {
  if (!secret) return false;
  if (authorization === `Bearer ${secret}`) return true;
  const match = /(?:^|;\s*)queue_token=([^;]+)/.exec(cookie ?? '');
  if (!match) return false;
  // A malformed percent-encoding (queue_token=%) must fail auth, not throw
  // a pre-auth 500 on attacker-controlled input.
  try {
    return decodeURIComponent(match[1]) === secret;
  } catch {
    return false;
  }
}

/** Subscribed tags for the settings UI. */
export async function getSubscriptions(client) {
  return await listSubscriptions(client);
}

/**
 * Replace the subscription set. Unknown tags are dropped, not errors — the
 * vocabulary is the only source of truth for what a tag is.
 */
export async function saveSubscriptions(client, tags, { now } = {}) {
  if (!Array.isArray(tags)) throw new Error('tags must be an array');
  const known = new Set(TAG_VOCABULARY);
  await setSubscriptions(client, tags.filter((t) => known.has(t)), { now });
}
