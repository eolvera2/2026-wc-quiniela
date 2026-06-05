import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchTeamStats } from './teams.js';
import { closeDb, openDb } from '../db/db.js';

const FOOTBALLDATA_HOST = 'https://footballdata.io';
const API_KEY = 'test-footballdata-key';

function mockSeasons() {
  return nock(FOOTBALLDATA_HOST)
    .get('/api/v1/leagues/50/seasons')
    .reply(200, { success: true, data: { seasons: [{ season_id: 618, year: 2026 }] } });
}

describe('ingest/teams', () => {
  let db;

  afterEach(() => {
    nock.cleanAll();
    if (db) {
      closeDb(db);
      db = null;
    }
  });

  it('fetches team statistics and returns normalized data', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/teams/10/stats')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          team: { team_id: 10, team_name: 'Mexico' },
          form: { overall: 'WWDLW' },
          summary: { goals_for: 12, goals_against: 5 },
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 50, season: 2026 });

    expect(stats.teamApiId).toBe(10);
    expect(stats.form).toBe('WWDLW');
    expect(stats.goalsScored).toBe(12);
    expect(stats.goalsConceded).toBe(5);
  });

  it('handles missing goals data gracefully (risk T2-4)', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/teams/10/stats')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          team: { team_id: 10, name: 'Mexico' },
          form: { overall: null },
          summary: {},
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 50, season: 2026 });

    expect(stats.form).toBeNull();
    expect(stats.goalsScored).toBe(0);
    expect(stats.goalsConceded).toBe(0);
  });

  it('caches team statistics when a DB is provided', async () => {
    db = openDb(':memory:');
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/teams/10/stats')
      .query(true)
      .once()
      .reply(200, {
        success: true,
        data: {
          team: { team_id: 10, team_name: 'Mexico' },
          form: { overall: 'WWDLW' },
          summary: { goals_for: 12, goals_against: 5 },
        },
      });

    const first = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 50, season: 2026, db, internalTeamId: 1, reason: 'seed' });
    const second = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 50, season: 2026, db, internalTeamId: 1, reason: 'seed' });

    expect(first.form).toBe('WWDLW');
    expect(second.form).toBe('WWDLW');
    expect(db.prepare("SELECT COUNT(*) AS count FROM provider_cache WHERE entity_type = 'team_stats'").get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM fetch_log WHERE cached = 1').get().count).toBe(1);
  });

  it('throws on HTTP error', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST).get('/api/v1/teams/10/stats').query(true).reply(500, { success: false, error: { message: 'Server error' } });

    await expect(
      fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 50, season: 2026 })
    ).rejects.toThrow(/500/);
  });
});
