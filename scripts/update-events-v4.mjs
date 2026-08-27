import { runIngestion } from './lib/run-ingestion.mjs';
import { SOURCES } from './sources/index-v3.mjs';

runIngestion(SOURCES).catch((error) => { console.error(error); process.exitCode = 1; });
