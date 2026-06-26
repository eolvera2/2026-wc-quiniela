import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { openDb, closeDb } from '../db/db.js';
import { seedStaticData } from '../../scripts/seed-static.js';
import { refreshKnockoutFixtures } from './knockoutFixtures.js';

describe('ingest/knockoutFixtures', () => {
  let db;

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (db) closeDb(db);
    db = null;
  });

  it('resolves Round of 32 TBD teams from the public scoreboard and survives static reseeding', async () => {
    db = openDb(':memory:');
    seedStaticData(db);

    nock.disableNetConnect();
    nock('https://site.api.espn.com')
      .get('/apis/site/v2/sports/soccer/fifa.world/scoreboard')
      .query({ dates: '20260628' })
      .reply(200, {
        events: [{
          id: '760486',
          date: '2026-06-28T19:00Z',
          links: [{ rel: ['summary'], href: 'https://www.espn.com/soccer/match/_/gameId/760486/canada-south-africa' }],
          competitions: [{
            competitors: [
              { homeAway: 'home', team: { abbreviation: 'RSA', displayName: 'South Africa' } },
              { homeAway: 'away', team: { abbreviation: 'CAN', displayName: 'Canada' } },
            ],
          }],
        }],
      });
    nock('https://site.api.espn.com')
      .get('/apis/site/v2/sports/soccer/fifa.world/scoreboard')
      .query({ dates: '20260629' })
      .reply(200, {
        events: [{
          id: '760489',
          date: '2026-06-29T20:30Z',
          links: [{ rel: ['summary'], href: 'https://www.espn.com/soccer/match/_/gameId/760489' }],
          competitions: [{
            competitors: [
              { homeAway: 'home', team: { abbreviation: 'GER', displayName: 'Germany' } },
              { homeAway: 'away', team: { abbreviation: '3RD', displayName: 'Third Place Group A/B/C/D/F' } },
            ],
          }],
        }],
      });
    nock('https://site.api.espn.com')
      .persist()
      .get('/apis/site/v2/sports/soccer/fifa.world/scoreboard')
      .query(true)
      .reply(200, { events: [] });

    const result = await refreshKnockoutFixtures(db, { startLocalDate: '2026-06-28' });

    expect(result.assignments).toContainEqual(expect.objectContaining({
      matchNumber: 73,
      homeTeam: 'Sudáfrica',
      awayTeam: 'Canadá',
      sourceName: 'ESPN public scoreboard',
    }));
    expect(result.assignments).toContainEqual(expect.objectContaining({
      matchNumber: 74,
      homeTeam: 'Alemania',
      awayTeam: 'Third Place Group A/B/C/D/F',
      tentative: true,
    }));

    seedStaticData(db);
    const resolved = db.prepare(`
      SELECT f.status, f.is_tbd, h.fifa_code AS homeCode, a.fifa_code AS awayCode, f.tbd_home_label, f.tbd_away_label
      FROM fixtures f
      JOIN teams h ON h.id = f.home_team_id
      JOIN teams a ON a.id = f.away_team_id
      WHERE f.match_number = 73
    `).get();

    expect(resolved).toEqual({
      status: 'scheduled',
      is_tbd: 0,
      homeCode: 'RSA',
      awayCode: 'CAN',
      tbd_home_label: null,
      tbd_away_label: null,
    });
    const tentative = db.prepare('SELECT is_tbd, tbd_home_label, tbd_away_label FROM fixtures WHERE match_number = 74').get();
    expect(tentative).toEqual({
      is_tbd: 1,
      tbd_home_label: 'Alemania',
      tbd_away_label: 'Third Place Group A/B/C/D/F',
    });
  });
});
