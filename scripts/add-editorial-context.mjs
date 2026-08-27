import { readFile, writeFile } from 'node:fs/promises';
import { whyForEvent } from '../lib/editorial-context.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const data = JSON.parse(await readFile(OUTPUT, 'utf8'));
const events = data.events.map((event) => ({ ...event, why: whyForEvent(event) }));
await writeFile(OUTPUT, `${JSON.stringify({ ...data, events }, null, 2)}\n`);
console.log(`Added editorial context to ${events.length} published events.`);
