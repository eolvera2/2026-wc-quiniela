import { describe, it, expect } from 'vitest';
import { selectPass } from './selectPass.js';

describe('selectPass', () => {
  // Helper: create a date N days/hours before kickoff
  const kickoff = '2026-06-11T18:00:00Z';
  const daysBeforeKickoff = (days) => new Date(new Date(kickoff).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const hoursBeforeKickoff = (hours) => new Date(new Date(kickoff).getTime() - hours * 60 * 60 * 1000).toISOString();

  it('returns "seed" when now is T-10 days or closer and no state', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(10) });
    expect(result).toBe('seed');
  });

  it('returns "seed" when now is T-9 (past threshold, tolerance window)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(9) });
    expect(result).toBe('seed');
  });

  it('returns null when now is T-12 (too early for any pass)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(12) });
    expect(result).toBeNull();
  });

  it('returns "refresh" when now is T-1 day and state is "seeded"', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(1) });
    expect(result).toBe('refresh');
  });

  it('returns "refresh" when now is T-12h (past threshold, self-healing)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: hoursBeforeKickoff(12) });
    expect(result).toBe('refresh');
  });

  it('returns null when state is "seeded" but T-2 (not yet T-1)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(2) });
    expect(result).toBeNull();
  });

  it('returns "final_refresh" when now is T-3h and state is "refreshed"', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(3) });
    expect(result).toBe('final_refresh');
  });

  it('returns "final_refresh" inside T-5h even if earlier passes were missed', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: hoursBeforeKickoff(4) });
    expect(result).toBe('final_refresh');
  });

  it('returns "final_refresh" inside T-5h from seeded state instead of waiting for another refresh run', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: hoursBeforeKickoff(4) });
    expect(result).toBe('final_refresh');
  });

  it('returns "lock" when now is T-1h from final_refreshed state', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'final_refreshed', now: hoursBeforeKickoff(1) });
    expect(result).toBe('lock');
  });

  it('returns "lock" when now is T-1h even if earlier passes were missed', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(1) });
    expect(result).toBe('lock');
  });

  it('returns null when state is "refreshed" but T-6h (not yet T-5h window)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(6) });
    expect(result).toBeNull();
  });

  it('returns null after final_refresh but before T-1h lock window', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'final_refreshed', now: hoursBeforeKickoff(2) });
    expect(result).toBeNull();
  });

  it('returns null when already "locked" (fully processed)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'locked', now: hoursBeforeKickoff(1) });
    expect(result).toBeNull();
  });

  it('returns null for past kickoffs (no retroactive processing)', () => {
    const pastKickoff = '2026-05-01T18:00:00Z';
    const result = selectPass({ kickoffUtc: pastKickoff, lifecycleState: null, now: '2026-06-01T00:00:00Z' });
    expect(result).toBeNull();
  });

  // Knockout clamp: fixture resolved inside T-10 seeds immediately
  it('returns "seed" immediately for knockout fixture resolved inside T-10', () => {
    // Knockout fixture with kickoff in 4 days (resolved inside T-10 window)
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(4) });
    expect(result).toBe('seed');
  });

  // Knockout compressed: seed + refresh can be close together
  it('returns "refresh" when seeded and already at T-1', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(1) });
    expect(result).toBe('refresh');
  });
});
