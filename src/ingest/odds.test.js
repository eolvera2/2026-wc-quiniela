import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchOdds } from './odds.js';

const FOOTBALLDATA_HOST = 'https://footballdata.io';
const API_KEY = 'test-footballdata-key';

describe('ingest/odds', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes odds for a fixture', async () => {
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/matches/1001/odds')
      .reply(200, {
        success: true,
        data: {
          odds: {
            match_winner: { home: 2.10, draw: 3.40, away: 3.50 },
          },
        },
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });

    expect(odds).toHaveLength(1);
    expect(odds[0].bookmaker).toBe('FootballData.io');
    expect(odds[0].homeWin).toBe(2.10);
    expect(odds[0].draw).toBe(3.40);
    expect(odds[0].awayWin).toBe(3.50);
  });

  it('handles empty odds response gracefully (risk T2-4: odds unavailable early)', async () => {
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/matches/1001/odds')
      .reply(200, { success: true, data: { odds: { match_winner: { home: 0, draw: 0, away: 0 } } } });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    expect(odds).toEqual([]);
  });

  it('handles missing Match Winner bet type', async () => {
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/matches/1001/odds')
      .reply(200, {
        success: true,
        data: {
          odds: {
            total_goals: { over_2_5: 2.1 },
          },
        },
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    // Should skip bookmakers without Match Winner
    expect(odds).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/matches/1001/odds')
      .reply(429, { success: false, error: { message: 'Rate limited' } });

    await expect(
      fetchOdds({ apiKey: API_KEY, fixtureId: 1001 })
    ).rejects.toThrow(/429/);
  });
});
