import { runIngestion } from './lib/run-ingestion-v2.mjs';
import { SOURCES } from './sources/index-v4.mjs';

runIngestion(SOURCES).catch((error) => { console.error(error); process.exitCode = 1; });
