import { readFile, writeFile } from 'node:fs/promises';
import { dedupeNearDuplicateEvents } from '../lib/near-duplicate-events.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const data = JSON.parse(await readFile(OUTPUT, 'utf8'));
const events = dedupeNearDuplicateEvents(data.events);
await writeFile(OUTPUT, `${JSON.stringify({ ...data, events }, null, 2)}\n`);
console.log(`Near-duplicate pass kept ${events.length}/${data.events.length} published events.`);
