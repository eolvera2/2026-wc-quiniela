import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb, upsertTeam, upsertFixture } from '../db/db.js';
import { checkDataAvailability } from './dataThreshold.js';

describe('dataThreshold', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertFixture(db, {
      apiFootballId: 100,
      homeTeamApiId: 1,
      awayTeamApiId: 2,
      kickoffUtc: '2026-06-11T18:00:00Z',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: null,
    });
  });

  afterEach(() => {
    closeDb(db);
  });

  it('returns ready=true when both teams exist (minimum for seed pass)', () => {
    const result = checkDataAvailability(db, 100, 'seed');
    expect(result.ready).toBe(true);
  });

  it('returns ready=false when fixture does not exist', () => {
    const result = checkDataAvailability(db, 999, 'seed');
    expect(result.ready).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('returns ready=true for refresh pass even without odds (graceful degradation)', () => {
    const result = checkDataAvailability(db, 100, 'refresh');
    expect(result.ready).toBe(true);
    expect(result.warnings).toContain('No odds data');
  });

  it('returns warnings listing missing optional data', () => {
    const result = checkDataAvailability(db, 100, 'refresh');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
