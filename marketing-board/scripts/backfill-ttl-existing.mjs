// One-shot backfill: set expires_at = created_at + 72h on pulse_signals/ideas cards
// that don't have a TTL yet. Run once after introducing the lifecycle.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const { getDb, runMigrations, closeDb } = await import('../lib/db.js');
runMigrations();
const db = getDb();
const result = db.prepare(
  "UPDATE cards SET expires_at = datetime(created_at, '+72 hours') WHERE stage IN ('pulse_signals','ideas') AND expires_at IS NULL"
).run();
console.log(`[backfill-ttl] Updated ${result.changes} pulse/ideas card(s) with expires_at = created_at + 72h.`);
closeDb();
