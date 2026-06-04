import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchFixtures } from './fixtures.js';

const FOOTBALLDATA_HOST = 'https://footballdata.io';
const API_KEY = 'test-footballdata-key';

function mockSeasons() {
  return nock(FOOTBALLDATA_HOST)
    .get('/api/v1/leagues/50/seasons')
    .reply(200, { success: true, data: { seasons: [{ season_id: 618, year: 2026 }] } });
}

const SAMPLE_FIXTURES_RESPONSE = {
  success: true,
  data: {
    matches: [
      {
        match_id: 1001,
        match_date: '2026-06-11 18:00:00',
        status: 'incomplete',
        game_week: 1,
        home_team: { team_id: 10, team_name: 'Mexico National Team', team_logo: 'https://logo.png' },
        away_team: { team_id: 20, team_name: 'Germany National Team', team_logo: 'https://logo2.png' },
        venue: { name: 'Estadio Azteca' },
      },
      {
        match_id: 1002,
        match_date: '2026-06-12 15:00:00',
        status: 'incomplete',
        game_week: 1,
        home_team: { team_id: 30, team_name: 'Brazil National Team', team_logo: 'https://logo3.png' },
        away_team: { team_id: 40, team_name: 'Japan National Team', team_logo: 'https://logo4.png' },
        venue: { name: 'SoFi Stadium' },
      },
    ],
  },
  meta: { pagination: { total_pages: 1 } },
};

describe('ingest/fixtures', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes WC2026 fixtures from FootballData.io', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/leagues/50/matches')
      .query(true)
      .reply(200, SAMPLE_FIXTURES_RESPONSE);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 50, season: 2026 });

    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toEqual({
      apiFootballId: 1001,
      homeTeam: { apiFootballId: 10, name: 'Mexico', logoUrl: 'https://logo.png' },
      awayTeam: { apiFootballId: 20, name: 'Germany', logoUrl: 'https://logo2.png' },
      kickoffUtc: '2026-06-11T18:00:00.000Z',
      round: 'Game Week 1',
      stage: 'group',
      status: 'scheduled',
      venue: 'Estadio Azteca',
    });
  });

  it('maps API status codes to internal status', async () => {
    const response = {
      success: true,
      data: {
        matches: [{
          match_id: 2001,
          match_date: '2026-06-20 18:00:00',
          status: 'complete',
          game_week: 4,
          home_team: { team_id: 50, team_name: 'Spain', team_logo: null },
          away_team: { team_id: 60, team_name: 'France', team_logo: null },
          venue: { name: 'Venue' },
        }],
      },
      meta: { pagination: { total_pages: 1 } },
    };

    mockSeasons();
    nock(FOOTBALLDATA_HOST).get('/api/v1/leagues/50/matches').query(true).reply(200, response);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 50, season: 2026 });
    expect(fixtures[0].status).toBe('resolved');
    expect(fixtures[0].stage).toBe('knockout');
  });

  it('handles empty response gracefully (risk T2-4)', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/leagues/50/matches')
      .query(true)
      .reply(200, { success: true, data: { matches: [] }, meta: { pagination: { total_pages: 1 } } });

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 50, season: 2026 });
    expect(fixtures).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST).get('/api/v1/leagues/50/matches').query(true).reply(403, { success: false, error: { message: 'Forbidden' } });

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 50, season: 2026 })
    ).rejects.toThrow(/403/);
  });

  it('throws on network failure', async () => {
    mockSeasons();
    nock(FOOTBALLDATA_HOST).get('/api/v1/leagues/50/matches').query(true).replyWithError('ECONNREFUSED');

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 50, season: 2026 })
    ).rejects.toThrow();
  });
});
