#!/usr/bin/env node
/**
 * CLI: npm run cost-report
 * Prints cost-per-article report from generation_log.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" cost-report spec.
 */

import { openDb, closeDb } from '../src/db/db.js';
import { generateCostReport } from '../src/generate/costReport.js';

const dbPath = process.env.DB_PATH || 'data/wc26.sqlite';

let db;
try {
  db = openDb(dbPath);
} catch (err) {
  console.error(`Failed to open database at ${dbPath}: ${err.message}`);
  console.error('Ensure the DB exists (run the pipeline at least once) or set DB_PATH.');
  process.exit(1);
}

try {
  const report = generateCostReport(db);

  console.log('\n=== WC26 Quiniela — Cost Report ===\n');
  console.log(`Total spend:                 $${report.totalSpend.toFixed(4)}`);
  console.log(`Articles generated:          ${report.articlesGenerated}`);
  console.log(`Cost/article (clean):        $${report.costPerArticle.toFixed(4)}`);
  console.log(`Cost/article (fully loaded): $${report.costPerArticleFullyLoaded.toFixed(4)}`);
  console.log('');

  if (Object.keys(report.modelSplit).length > 0) {
    console.log('--- Model Split ---');
    for (const [model, data] of Object.entries(report.modelSplit)) {
      console.log(`  ${model}: ${data.calls} calls (${data.callPercent.toFixed(1)}%) | $${data.spend.toFixed(4)} (${data.spendPercent.toFixed(1)}%)`);
    }
    console.log('');
  }

  console.log('--- V2 Projection ---');
  console.log(`  Fixtures: ${report.projection.totalFixtures}`);
  console.log(`  Article types: ${report.projection.articleTypesCount}`);
  console.log(`  Passes/article: ${report.projection.passesPerArticle}`);
  console.log(`  Estimated total: $${report.projection.v2TotalEstimate.toFixed(2)}`);
  console.log('');
} finally {
  closeDb(db);
}
