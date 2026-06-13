/**
 * Cadence pass selector — pure function.
 * Given a fixture's kickoff_utc, current time, and lifecycle_state,
 * determines which pass (if any) is due.
 *
 * Reference: docs/plan.md "Publishing Cadence & Lifecycle"
 *
 * Thresholds:
 *   Seed:    T-10 days (trigger when ≤10 days to kickoff)
 *   Refresh:       T-1 day   (trigger when ≤1 day to kickoff)
 *   Final refresh: T-5 hours (trigger when ≤5 hours to kickoff)
 *   Lock:          T-1 hour  (trigger when ≤1 hour to kickoff)
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
const REFRESH_THRESHOLD = 1 * MS_PER_DAY;
const FINAL_REFRESH_THRESHOLD = 5 * MS_PER_HOUR;
const LOCK_THRESHOLD = 1 * MS_PER_HOUR;

/**
 * @param {{ kickoffUtc: string, lifecycleState: string|null, now: string }} params
 * @returns {'seed' | 'refresh' | 'final_refresh' | 'lock' | null}
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

  // State machine: choose the most urgent due pass. This lets missed earlier
  // passes self-heal in later windows instead of needing multiple runs.
  if (timeUntilKickoff <= LOCK_THRESHOLD) {
    return 'lock';
  }

  if (timeUntilKickoff <= FINAL_REFRESH_THRESHOLD && lifecycleState !== 'final_refreshed') {
    return 'final_refresh';
  }

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
    if (timeUntilKickoff <= FINAL_REFRESH_THRESHOLD) {
      return 'final_refresh';
    }
    return null;
  }

  if (lifecycleState === 'final_refreshed') {
    if (timeUntilKickoff <= LOCK_THRESHOLD) {
      return 'lock';
    }
    return null;
  }

  return null;
}
