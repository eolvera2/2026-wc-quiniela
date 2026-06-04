import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { fetchOdds } from './odds.js';

const API_FOOTBALL_HOST = 'https://v3.football.api-sports.io';
const API_KEY = 'test-api-football-key';

describe('ingest/odds', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('fetches and normalizes odds for a fixture', async () => {
    nock(API_FOOTBALL_HOST)
      .get('/odds')
      .query(true)
      .reply(200, {
        response: [{
          bookmakers: [{
            name: 'Bet365',
            bets: [{
              name: 'Match Winner',
              values: [
                { value: 'Home', odd: '2.10' },
                { value: 'Draw', odd: '3.40' },
                { value: 'Away', odd: '3.50' },
              ],
            }],
          }],
        }],
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });

    expect(odds).toHaveLength(1);
    expect(odds[0].bookmaker).toBe('Bet365');
    expect(odds[0].homeWin).toBe(2.10);
    expect(odds[0].draw).toBe(3.40);
    expect(odds[0].awayWin).toBe(3.50);
  });

  it('handles empty odds response gracefully (risk T2-4: odds unavailable early)', async () => {
    nock(API_FOOTBALL_HOST).get('/odds').query(true).reply(200, { response: [] });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    expect(odds).toEqual([]);
  });

  it('handles missing Match Winner bet type', async () => {
    nock(API_FOOTBALL_HOST)
      .get('/odds')
      .query(true)
      .reply(200, {
        response: [{
          bookmakers: [{
            name: 'Caliente',
            bets: [{ name: 'Over/Under', values: [] }],
          }],
        }],
      });

    const odds = await fetchOdds({ apiKey: API_KEY, fixtureId: 1001 });
    // Should skip bookmakers without Match Winner
    expect(odds).toEqual([]);
  });

  it('throws on HTTP error', async () => {
    nock(API_FOOTBALL_HOST).get('/odds').query(true).reply(429, 'Rate limited');

    await expect(
      fetchOdds({ apiKey: API_KEY, fixtureId: 1001 })
    ).rejects.toThrow(/429/);
  });
});
