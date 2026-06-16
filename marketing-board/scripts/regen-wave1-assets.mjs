// Regenerates PNG assets for cards currently in to_be_posted using the existing
// payload. Uses the new fit-or-fail wrap pipeline; any TextOverflowError will
// surface here with the card id + size + offending text. Does NOT advance stage,
// does NOT modify card data — only rewrites the PNG files on disk.

import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { renderCardAssets } = await import('../renderers/index.js');

const WAVE_DATE = '2026-06-11';
const OUT_ROOT = `.squad\\agents\\shuri\\outputs\\creative\\${WAVE_DATE}`;
const REQUIRED = ['1080x1920', '1080x1350', '1080x1080'];

const db = new Database('marketing.sqlite');
const rows = db
  .prepare("SELECT id, title, pillar, payload_json FROM cards WHERE stage = 'to_be_posted' ORDER BY id")
  .all();

if (rows.length === 0) {
  console.log('No cards in to_be_posted. Nothing to regenerate.');
  process.exit(0);
}

console.log(`Regenerating ${rows.length} card(s)…`);
let passed = 0;
let failed = 0;
const failures = [];

for (const row of rows) {
  const payload = JSON.parse(row.payload_json || '{}');
  const card = { id: row.id, title: row.title, pillar: row.pillar, payload };
  const outDir = `${OUT_ROOT}\\${row.id}`;
  try {
    const results = await renderCardAssets(card, { outDir });
    for (const key of REQUIRED) {
      if (!results[key]) throw new Error(`missing size ${key}`);
      const size = statSync(results[key]).size;
      if (size < 5_000) throw new Error(`${key} too small (${size} bytes)`);
    }
    console.log(`  ✓ ${row.id}  (${row.pillar})`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${row.id}  (${row.pillar}) — ${error.message}`);
    failures.push({ id: row.id, pillar: row.pillar, message: error.message });
    failed += 1;
  }
}

db.close();

console.log(`\nRegen complete: ${passed} passed, ${failed} failed.`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.id} [${f.pillar}]: ${f.message}`);
  process.exit(1);
}
