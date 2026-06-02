/**
 * Cadence pass selector — pure function.
 * Given a fixture's kickoff_utc, current time, and lifecycle_state,
 * determines which pass (if any) is due.
 *
 * Reference: docs/plan.md "Publishing Cadence & Lifecycle"
 *
 * Thresholds:
 *   Seed:    T-10 days (trigger when ≤10 days to kickoff)
 *   Refresh: T-2 days  (trigger when ≤2 days to kickoff)
 *   Lock:    T-5 hours (trigger when ≤5 hours to kickoff — scheduled at T-4h to catch T-3h)
 *
 * Self-healing: once past a threshold, the pass remains due until executed.
 * This means a missed cron tick self-heals on the next run.
 *
 * Knockout clamp: a fixture resolved inside T-10 seeds immediately (the
 * threshold check handles this naturally — if ≤10 days, seed is due).
 *
 * Does NOT process past kickoffs (no retroactive generation).
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Thresholds in milliseconds before kickoff
const SEED_THRESHOLD = 10 * MS_PER_DAY;
const REFRESH_THRESHOLD = 2 * MS_PER_DAY;
const LOCK_THRESHOLD = 5 * MS_PER_HOUR;

/**
 * @param {{ kickoffUtc: string, lifecycleState: string|null, now: string }} params
 * @returns {'seed' | 'refresh' | 'lock' | null}
 */
export function selectPass({ kickoffUtc, lifecycleState, now }) {
  const kickoffMs = new Date(kickoffUtc).getTime();
  const nowMs = new Date(now).getTime();
  const timeUntilKickoff = kickoffMs - nowMs;

  // Don't process past kickoffs
  if (timeUntilKickoff <= 0) {
    return null;
  }

  // Already fully processed
  if (lifecycleState === 'locked') {
    return null;
  }

  // State machine: determine what's due based on current state + time
  if (lifecycleState === null || lifecycleState === undefined) {
    // Not yet seeded — seed is due if within threshold
    if (timeUntilKickoff <= SEED_THRESHOLD) {
      return 'seed';
    }
    return null;
  }

  if (lifecycleState === 'seeded') {
    // Refresh is due if within threshold
    if (timeUntilKickoff <= REFRESH_THRESHOLD) {
      return 'refresh';
    }
    return null;
  }

  if (lifecycleState === 'refreshed') {
    // Lock is due if within threshold (T-5h window, scheduled at T-4h)
    if (timeUntilKickoff <= LOCK_THRESHOLD) {
      return 'lock';
    }
    return null;
  }

  return null;
}
