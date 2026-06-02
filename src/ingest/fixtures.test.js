import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchFixtures } from './fixtures.js';

const RAPIDAPI_HOST = 'https://api-football-v1.p.rapidapi.com';
const API_KEY = 'test-rapid-key';

const SAMPLE_FIXTURES_RESPONSE = {
  response: [
    {
      fixture: {
        id: 1001,
        date: '2026-06-11T18:00:00+00:00',
        venue: { name: 'Estadio Azteca', city: 'Mexico City' },
        status: { short: 'NS' },
      },
      league: { round: 'Group A - 1' },
      teams: {
        home: { id: 10, name: 'Mexico', logo: 'https://logo.png' },
        away: { id: 20, name: 'Germany', logo: 'https://logo2.png' },
      },
    },
    {
      fixture: {
        id: 1002,
        date: '2026-06-12T15:00:00+00:00',
        venue: { name: 'SoFi Stadium', city: 'Los Angeles' },
        status: { short: 'NS' },
      },
      league: { round: 'Group B - 1' },
      teams: {
        home: { id: 30, name: 'Brazil', logo: 'https://logo3.png' },
        away: { id: 40, name: 'Japan', logo: 'https://logo4.png' },
      },
    },
  ],
};

describe('ingest/fixtures', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes WC2026 fixtures from API-Football', async () => {
    nock(RAPIDAPI_HOST)
      .get('/v3/fixtures')
      .query(true)
      .reply(200, SAMPLE_FIXTURES_RESPONSE);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });

    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toEqual({
      apiFootballId: 1001,
      homeTeam: { apiFootballId: 10, name: 'Mexico', logoUrl: 'https://logo.png' },
      awayTeam: { apiFootballId: 20, name: 'Germany', logoUrl: 'https://logo2.png' },
      kickoffUtc: '2026-06-11T18:00:00+00:00',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: 'Estadio Azteca',
    });
  });

  it('maps API status codes to internal status', async () => {
    const response = {
      response: [{
        fixture: { id: 2001, date: '2026-06-20T18:00:00+00:00', venue: { name: 'Venue' }, status: { short: 'FT' } },
        league: { round: 'Quarter-final' },
        teams: {
          home: { id: 50, name: 'Spain', logo: null },
          away: { id: 60, name: 'France', logo: null },
        },
      }],
    };

    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(200, response);

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });
    expect(fixtures[0].status).toBe('resolved');
    expect(fixtures[0].stage).toBe('knockout');
  });

  it('handles empty response gracefully (risk T2-4)', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(200, { response: [] });

    const fixtures = await fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 });
    expect(fixtures).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).reply(403, { message: 'Forbidden' });

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 })
    ).rejects.toThrow(/403/);
  });

  it('throws on network failure', async () => {
    nock(RAPIDAPI_HOST).get('/v3/fixtures').query(true).replyWithError('ECONNREFUSED');

    await expect(
      fetchFixtures({ apiKey: API_KEY, leagueId: 1, season: 2026 })
    ).rejects.toThrow();
  });
});
