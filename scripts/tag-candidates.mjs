import { fileURLToPath } from 'node:url';
import { openPool, listCandidates, setTags, clearTagsBy } from '../lib/pool-db.mjs';
import { TAG_VOCABULARY } from '../lib/tag-vocabulary.mjs';
import { tagPrompt, parseTagResponse } from '../lib/tagging.mjs';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Batch-tag untagged candidates with the cheap model (决策记录 0005's channel,
 * second use). Writes ONLY the tags table via setTags(); never candidates,
 * never decisions.
 *
 *   node scripts/tag-candidates.mjs             # tag whatever has no tags yet
 *   node scripts/tag-candidates.mjs --dry-run   # show what would be sent, no API call
 *   node scripts/tag-candidates.mjs --retag     # clear ai:* tags first, then re-tag all
 *
 * The model may only pick from lib/tag-vocabulary.mjs; parse drops the rest.
 * Cost bound: ~1000 candidates / 20 per call = ~50 model calls.
 *
 * Runs against DeepSeek's Anthropic-compatible endpoint (payment access; a
 * prepaid balance is already sitting there). Requires:
 *   ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
 *   ANTHROPIC_API_KEY=<DeepSeek key>
 * To switch back to haiku: restore MODEL/TAGGED_BY, unset the base URL,
 * then --retag (tags are batch-replaceable by design, 0005).
 */
const MODEL = 'deepseek-chat';
const TAGGED_BY = 'ai:deepseek-chat';
const BATCH = 20;

const dryRun = process.argv.includes('--dry-run');
const retag = process.argv.includes('--retag');

const pool = openPool(fileURLToPath(new URL('../data/pool.db', import.meta.url)));
if (retag && !dryRun) clearTagsBy(pool, TAGGED_BY);

// taggedBy (not tags.length): "宁缺毋滥" means the model legitimately returns []
// for some candidates, and a tagged-with-zero-tags row must not be re-sent to
// the API on every run. Ended one-off candidates are skipped — they can never
// enter a round, so tagging them buys nothing (~14% of the pool at last count).
const today = new Date().toISOString().slice(0, 10);
const todo = listCandidates(pool).filter((c) => c.state !== 'rejected' && c.taggedBy === null
  && (c.ongoing || (c.endDate ?? c.startDate) >= today));
console.log(`${todo.length} candidates to tag (batch of ${BATCH}, model ${MODEL})`);
if (dryRun) {
  console.log(tagPrompt(todo.slice(0, BATCH), TAG_VOCABULARY));
  process.exit(0);
}

const client = new Anthropic();
let done = 0;
let skippedBatches = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  // One bad batch (429, truncation, malformed JSON) must not kill the run;
  // untagged rows re-enter `todo` on the next invocation, so skipping is safe.
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: tagPrompt(chunk, TAG_VOCABULARY) }],
    });
    if (response.stop_reason === 'max_tokens') console.warn(`batch at ${i}: reply truncated at max_tokens`);
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const tagsById = parseTagResponse(text, chunk.map((c) => c.id), TAG_VOCABULARY);
    for (const c of chunk) {
      // An id the model omitted still gets an empty row — without it the same
      // candidate is re-sent (and re-billed) on every future run, forever.
      setTags(pool, c.id, { tags: tagsById.get(c.id) ?? [], taggedBy: TAGGED_BY });
      done += 1;
    }
  } catch (error) {
    skippedBatches += 1;
    console.warn(`batch at ${i} skipped: ${error.message}`);
  }
  console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length}`);
}
console.log(`tagged ${done} candidates as ${TAGGED_BY}${skippedBatches ? `, ${skippedBatches} batches skipped (re-run to retry)` : ''}`);
