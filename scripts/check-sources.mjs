#!/usr/bin/env node
/**
 * Report source health from data/source-registry.json and exit non-zero on a
 * critical alert. Run this AFTER update-events in CI, so a broken parser fails
 * the build loudly while the data that did arrive still gets committed.
 */
import { readFile } from 'node:fs/promises';
import { CRITICAL, formatAlert, hasCriticalAlert } from '../lib/source-health.mjs';

const REGISTRY = new URL('../data/source-registry.json', import.meta.url);

const registry = await readFile(REGISTRY, 'utf8').then(JSON.parse).catch((error) => {
  if (error.code === 'ENOENT') {
    console.error('尚无 data/source-registry.json，先跑一次 npm run update-events。');
    process.exit(1);
  }
  throw error;
});

const alerts = registry.alerts || [];

// CJK glyphs occupy two terminal columns but one code unit, so padEnd misaligns.
const displayWidth = (value) => [...value].reduce((total, char) => total + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(char) ? 2 : 1), 0);
const pad = (value, width) => value + ' '.repeat(Math.max(0, width - displayWidth(value)));
const width = Math.max(...registry.entries.map(({ name }) => displayWidth(name)), 4);

console.log(`来源健康 · ${registry.updatedAt}\n`);
for (const entry of registry.entries) {
  const status = entry.failureStreak ? `失败 x${entry.failureStreak}` : `${entry.lastItemCount} 条`;
  console.log(`  ${pad(entry.name, width)}  ${pad(status, 10)}  ${entry.trustTier || '--'}  ${entry.baseUrl}`);
}

if (!alerts.length) {
  console.log('\n无告警。');
  process.exit(0);
}

console.log(`\n${alerts.length} 条告警：`);
for (const alert of alerts) console.log(`  ${formatAlert(alert)}`);

if (hasCriticalAlert(registry)) {
  console.error(`\n存在 ${alerts.filter(({ level }) => level === CRITICAL).length} 条严重告警。`);
  process.exit(1);
}
