import { runIngestion } from './lib/run-ingestion.mjs';
import { SOURCES } from './sources/index.mjs';

// Some sites refuse GitHub's runner IPs while serving the same request from a
// Japanese connection (measured 2026-11-15). We do not route around that: on
// CI those sources are skipped and their registry entries carried over, and
// scripts/local-daily.ps1 fetches the full set from a machine in Japan.
const onCi = Boolean(process.env.GITHUB_ACTIONS);
const japanOnly = SOURCES.filter((source) => source.japanOnly);
const sources = onCi ? SOURCES.filter((source) => !source.japanOnly) : SOURCES;
if (onCi && japanOnly.length) console.log(`Skipping ${japanOnly.length} Japan-only sources on CI: ${japanOnly.map((s) => s.name).join(', ')}`);

runIngestion(sources, { carryOver: onCi ? japanOnly : [] }).catch((error) => { console.error(error); process.exitCode = 1; });
