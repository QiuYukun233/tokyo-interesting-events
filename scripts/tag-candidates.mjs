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
 * Cost bound: ~1000 candidates / 20 per call = ~50 haiku calls.
 */
const MODEL = 'claude-haiku-4-5';
const TAGGED_BY = 'ai:haiku-4.5';
const BATCH = 20;

const dryRun = process.argv.includes('--dry-run');
const retag = process.argv.includes('--retag');

const pool = openPool(fileURLToPath(new URL('../data/pool.db', import.meta.url)));
if (retag && !dryRun) clearTagsBy(pool, TAGGED_BY);

// taggedBy (not tags.length): "宁缺毋滥" means the model legitimately returns []
// for some candidates, and a tagged-with-zero-tags row must not be re-sent to
// the API on every run.
const todo = listCandidates(pool).filter((c) => c.state !== 'rejected' && c.taggedBy === null);
console.log(`${todo.length} candidates to tag (batch of ${BATCH}, model ${MODEL})`);
if (dryRun) {
  console.log(tagPrompt(todo.slice(0, BATCH), TAG_VOCABULARY));
  process.exit(0);
}

const client = new Anthropic();
let done = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: tagPrompt(chunk, TAG_VOCABULARY) }],
  });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const tagsById = parseTagResponse(text, chunk.map((c) => c.id), TAG_VOCABULARY);
  for (const [id, tags] of tagsById) {
    setTags(pool, id, { tags, taggedBy: TAGGED_BY });
    done += 1;
  }
  console.log(`${Math.min(i + BATCH, todo.length)}/${todo.length}`);
}
console.log(`tagged ${done} candidates as ${TAGGED_BY}`);
