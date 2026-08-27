import { readFile, writeFile } from 'node:fs/promises';
import { enrichUTokyoEvent } from './sources/utokyo-enrich.mjs';

const OUTPUT = new URL('../data/events.json', import.meta.url);
const data = JSON.parse(await readFile(OUTPUT, 'utf8'));
const events = [];
for (const event of data.events) {
  events.push(event.source === '東京大学' ? await enrichUTokyoEvent(event) : event);
}
await writeFile(OUTPUT, `${JSON.stringify({ ...data, events }, null, 2)}\n`);
const enriched = events.filter((event) => event.enrichmentStatus === 'enriched').length;
console.log(`Detail enrichment succeeded for ${enriched} published events.`);
