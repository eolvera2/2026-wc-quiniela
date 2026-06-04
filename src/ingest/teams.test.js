import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchTeamStats } from './teams.js';

const API_FOOTBALL_HOST = 'https://v3.football.api-sports.io';
const API_KEY = 'test-api-football-key';

describe('ingest/teams', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches team statistics and returns normalized data', async () => {
    nock(API_FOOTBALL_HOST)
      .get('/teams/statistics')
      .query(true)
      .reply(200, {
        response: {
          team: { id: 10, name: 'Mexico' },
          form: 'WWDLW',
          goals: { for: { total: { total: 12 } }, against: { total: { total: 5 } } },
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 });

    expect(stats.teamApiId).toBe(10);
    expect(stats.form).toBe('WWDLW');
    expect(stats.goalsScored).toBe(12);
    expect(stats.goalsConceded).toBe(5);
  });

  it('handles missing goals data gracefully (risk T2-4)', async () => {
    nock(API_FOOTBALL_HOST)
      .get('/teams/statistics')
      .query(true)
      .reply(200, {
        response: {
          team: { id: 10, name: 'Mexico' },
          form: null,
          goals: { for: { total: {} }, against: { total: {} } },
        },
      });

    const stats = await fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 });

    expect(stats.form).toBeNull();
    expect(stats.goalsScored).toBe(0);
    expect(stats.goalsConceded).toBe(0);
  });

  it('throws on HTTP error', async () => {
    nock(API_FOOTBALL_HOST).get('/teams/statistics').query(true).reply(500, 'Server error');

    await expect(
      fetchTeamStats({ apiKey: API_KEY, teamId: 10, leagueId: 1, season: 2026 })
    ).rejects.toThrow(/500/);
  });
});
