/**
 * Pure rules for friend invites (docs/朋友投票设计.md). No I/O: the cloud
 * layer stores and loads, this module decides what is valid and what a
 * pair of votes means.
 */
import { randomBytes } from 'node:crypto';

export const INVITE_VOTES = new Set(['want', 'ok', 'no']);
export const MAX_REPLIES_PER_INVITE = 30;
export const MAX_NAME_LENGTH = 20;

/** 128 random bits, URL-safe. The code is the link's only credential. */
export function newInviteCode() {
  return randomBytes(16).toString('base64url');
}

/** The display fields frozen into an invite, so the link outlives the mirror row. */
export function snapshotOf(candidate) {
  const { id, title, titleZh, place, time, price, startDate, endDate, sourceUrl, tags } = candidate;
  return {
    id, title, titleZh: titleZh ?? null, place: place ?? null, time: time ?? null, price: price ?? null,
    startDate, endDate: endDate ?? null, sourceUrl: sourceUrl ?? null, tags: tags ?? [],
  };
}

/** Normalizes a reply or throws with a message fit for a 400. */
export function validateReply({ responderId, name, vote } = {}) {
  if (typeof responderId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(responderId)) {
    throw new Error('responderId is required');
  }
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('name is required');
  if ([...trimmed].length > MAX_NAME_LENGTH) throw new Error(`name must be at most ${MAX_NAME_LENGTH} characters`);
  if (!INVITE_VOTES.has(vote)) throw new Error(`vote must be one of ${[...INVITE_VOTES].join('/')}`);
  return { responderId, name: trimmed, vote };
}

/**
 * The pairwise match between the inviter and one friend (方案 §7.3).
 * null when either side has not voted — nothing to reveal yet.
 */
export function matchOf(a, b) {
  if (!INVITE_VOTES.has(a) || !INVITE_VOTES.has(b)) return null;
  if (a === 'no' || b === 'no') return 'no_match';
  if (a === 'want' && b === 'want') return 'both_want';
  if (a === 'ok' && b === 'ok') return 'both_ok';
  return 'can_go';
}
