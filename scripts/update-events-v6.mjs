import { runIngestion } from './lib/run-ingestion.mjs';
import { SOURCES } from './sources/index-v5.mjs';

runIngestion(SOURCES).catch((error) => { console.error(error); process.exitCode = 1; });
