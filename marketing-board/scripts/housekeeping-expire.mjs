// Housekeeping: auto-kill cards in early stages (pulse_signals / ideas) whose
// `expires_at` has passed and which have NO downstream activity yet (no copywritten /
// review / to_be_posted siblings, no posts). Run nightly via cron or manually.
//
// Usage:  node marketing-board/scripts/housekeeping-expire.mjs [--dry-run]

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
process.chdir(repoRoot);

const { getDb, runMigrations, closeDb } = await import('../lib/db.js');
const { advanceCard } = await import('../lib/cards.js');

const dryRun = process.argv.includes('--dry-run');
runMigrations();
const db = getDb();

// Pulse / Ideas / Copywritten = work-in-progress that hasn't been published.
// Cards in to_be_posted / posted / killed are out of scope (we don't auto-kill
// finished work).
const STALE_STAGES = ['pulse_signals', 'ideas', 'copywritten'];
const placeholders = STALE_STAGES.map(() => '?').join(',');
const expired = db
  .prepare(
    `SELECT id, title, stage, expires_at FROM cards
     WHERE stage IN (${placeholders})
       AND expires_at IS NOT NULL
       AND expires_at < datetime('now')`,
  )
  .all(...STALE_STAGES);

if (!expired.length) {
  console.log('[housekeeping] No expired cards.');
  closeDb();
  process.exit(0);
}

console.log(`[housekeeping] Found ${expired.length} expired card(s).${dryRun ? ' (DRY RUN)' : ''}`);
let killed = 0;
for (const card of expired) {
  console.log(`  · ${card.id} [${card.stage}]  expired ${card.expires_at}  ::  ${card.title.slice(0, 60)}`);
  if (dryRun) continue;
  await advanceCard(db, card.id, {
    to_stage: 'killed',
    actor: 'housekeeping',
    type: 'expire',
    note: `Auto-kill: expired at ${card.expires_at} without progressing past ${card.stage}.`,
    meta: { previous_stage: card.stage, expires_at: card.expires_at },
  });
  killed += 1;
}

console.log(`[housekeeping] Killed ${killed} card(s).`);
closeDb();
