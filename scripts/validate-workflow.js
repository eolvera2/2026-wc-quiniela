#!/usr/bin/env node
/**
 * Validates .github/workflows/cadence.yml has all required structure.
 * Run: node scripts/validate-workflow.js
 * Exits 0 on success, 1 on failure.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_PATH = resolve('.github/workflows/cadence.yml');

let content;
try {
  content = readFileSync(WORKFLOW_PATH, 'utf-8');
} catch (err) {
  console.error(`❌ Cannot read workflow file: ${err.message}`);
  process.exit(1);
}

const REQUIRED_PATTERNS = [
  { pattern: /on:\s*\n\s+schedule:/, label: 'schedule trigger' },
  { pattern: /workflow_dispatch:/, label: 'workflow_dispatch trigger' },
  { pattern: /NODE_VERSION:\s*'20'/, label: 'Node.js 20 runtime' },
  { pattern: /concurrency:\s*\n\s+group:\s*wc26-pipeline/, label: 'concurrency group' },
  { pattern: /cancel-in-progress:\s*false/, label: 'cancel-in-progress: false' },
  { pattern: /secrets\.AZURE_AI_ENDPOINT/, label: 'AZURE_AI_ENDPOINT secret' },
  { pattern: /secrets\.AZURE_AI_KEY/, label: 'AZURE_AI_KEY secret' },
  { pattern: /AZURE_AI_DEPLOYMENT_ROBUST:\s*\$\{\{\s*vars\.AZURE_AI_DEPLOYMENT_ROBUST\s*\|\|\s*'gpt-4o'\s*\}\}/, label: 'AZURE_AI_DEPLOYMENT_ROBUST default' },
  { pattern: /secrets\.FOOTBALLDATA_KEY/, label: 'FOOTBALLDATA_KEY secret' },
  { pattern: /secrets\.AZURE_STORAGE_CONNECTION_STRING/, label: 'AZURE_STORAGE_CONNECTION_STRING secret' },
  { pattern: /secrets\.SWA_DEPLOYMENT_TOKEN/, label: 'SWA_DEPLOYMENT_TOKEN secret' },
  { pattern: /Azure\/static-web-apps-deploy/, label: 'Azure Static Web Apps deploy step' },
  { pattern: /vars\.SITE_BASE_URL/, label: 'SITE_BASE_URL variable' },
  { pattern: /if:\s*failure\(\)/, label: 'failure alert step' },
  { pattern: /npm ci/, label: 'npm ci step' },
  { pattern: /publish_target:/, label: 'publish target dispatch input' },
  { pattern: /default:\s*live/, label: 'live default dispatch target' },
  { pattern: /run:\s*npm run build:coming-soon/, label: 'coming soon build step' },
  { pattern: /cron:\s*'\*\/15 \* \* \* \*'/, label: '15-minute schedule' },
  { pattern: /timeout-minutes:\s*75/, label: 'extended cadence timeout' },
  { pattern: /FINAL_SCORE_WAIT_MINUTES:\s*'45'/, label: 'final-score wait window' },
  { pattern: /github\.event_name == 'workflow_dispatch' && inputs\.publish_target == 'demo'/, label: 'manual demo build' },
  {
    pattern: /github\.event_name == 'workflow_dispatch' && inputs\.publish_target == 'coming_soon'/,
    label: 'manual coming soon build',
  },
  { pattern: /github\.event_name == 'schedule' \|\| inputs\.publish_target == 'live'/, label: 'scheduled/manual live cadence build' },
  { pattern: /BASE_PATH:\s*''/, label: 'coming soon root build' },
  {
    pattern: /success\(\) && \(github\.event_name == 'schedule' \|\| inputs\.publish_target == 'live'\)/,
    label: 'scheduled/live deploy enabled',
  },
  {
    pattern: /Build demo site \(manual preview only\)/,
    label: 'demo deploy path removed from production',
  },
  { pattern: /run-cadence\.js/, label: 'run-cadence.js execution' },
];

let allPassed = true;
for (const { pattern, label } of REQUIRED_PATTERNS) {
  if (!pattern.test(content)) {
    console.error(`❌ Missing: ${label}`);
    allPassed = false;
  } else {
    console.log(`✅ Found: ${label}`);
  }
}

if (allPassed) {
  console.log('\n✅ Workflow validation PASSED');
  process.exit(0);
} else {
  console.error('\n❌ Workflow validation FAILED');
  process.exit(1);
}
