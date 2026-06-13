import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { openDb, closeDb } from '../db/db.js';
import { seedStaticData } from '../../scripts/seed-static.js';
import { hydrateFixtureFromFootballData } from './matchHydration.js';

const FOOTBALLDATA_HOST = 'https://footballdata.io';
const API_KEY = 'test-footballdata-key';

describe('ingest/matchHydration', () => {
  let db;

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (db) closeDb(db);
    db = null;
  });

  it('skips FootballData entirely for seed passes', async () => {
    nock.disableNetConnect();
    db = openDb(':memory:');
    seedStaticData(db);

    const fixture = db.prepare(`
      SELECT f.id,
             f.api_football_id,
             f.kickoff_utc AS kickoffUtc,
             f.home_team_id AS homeTeamId,
             f.away_team_id AS awayTeamId,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE ht.name = 'Qatar' AND at.name = 'Switzerland'
    `).get();

    await expect(hydrateFixtureFromFootballData(db, fixture, { apiKey: API_KEY, pass: 'seed' }))
      .resolves.toMatchObject({ skipped: true, matched: false, odds: 0, teamStats: 0 });
  });

  it('matches localized fixtures to FootballData provider names', async () => {
    db = openDb(':memory:');
    seedStaticData(db);

    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/leagues/50/seasons')
      .reply(200, { success: true, data: { seasons: [{ season_id: 618, year: 2026 }] } });
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/leagues/50/matches')
      .query(true)
      .reply(200, {
        success: true,
        data: {
          matches: [
            {
              match_id: 211664,
              match_date: '2026-06-12 02:00:00',
              status: 'incomplete',
              game_week: 1,
              home_team: { team_id: 101, team_name: 'South Korea', team_logo: null },
              away_team: { team_id: 102, team_name: 'Czech Republic', team_logo: null },
              venue: { name: 'Fixture venue' },
            },
            {
              match_id: 211661,
              match_date: '2026-06-12 19:00:00',
              status: 'complete',
              game_week: 1,
              home_team: { team_id: 103, team_name: 'Canada', team_logo: null },
              away_team: { team_id: 104, team_name: 'Bosnia and Herzegovina', team_logo: null },
              venue: { name: 'Fixture venue' },
            },
            {
              match_id: 204602,
              match_date: '2026-06-13 01:00:00',
              status: 'incomplete',
              game_week: 1,
              home_team: { team_id: 105, team_name: 'USMNT', team_logo: null },
              away_team: { team_id: 106, team_name: 'Paraguay', team_logo: null },
              venue: { name: 'Fixture venue' },
            },
          ],
        },
        meta: { pagination: { total_pages: 1 } },
      });

    const fixture = db.prepare(`
      SELECT f.id,
             f.api_football_id,
             f.kickoff_utc AS kickoffUtc,
             f.home_team_id AS homeTeamId,
             f.away_team_id AS awayTeamId,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE ht.name = 'South Korea' AND at.name = 'Czech Republic'
    `).get();

    const result = await hydrateFixtureFromFootballData(db, fixture, {
      apiKey: API_KEY,
      pass: 'lock',
    });

    expect(result).toMatchObject({
      matched: true,
      providerFixtureId: 211664,
      odds: 0,
      teamStats: 0,
    });

    const canada = db.prepare(`
      SELECT f.id,
             f.api_football_id,
             f.kickoff_utc AS kickoffUtc,
             f.home_team_id AS homeTeamId,
             f.away_team_id AS awayTeamId,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE ht.name = 'Canada' AND at.name = 'Bosnia & Herzegovina'
    `).get();
    await expect(hydrateFixtureFromFootballData(db, canada, { apiKey: API_KEY, pass: 'lock' }))
      .resolves.toMatchObject({ matched: true, providerFixtureId: 211661 });

    const usa = db.prepare(`
      SELECT f.id,
             f.api_football_id,
             f.kickoff_utc AS kickoffUtc,
             f.home_team_id AS homeTeamId,
             f.away_team_id AS awayTeamId,
             COALESCE(hln.name, ht.name) AS homeTeam,
             COALESCE(aln.name, at.name) AS awayTeam
      FROM fixtures f
      JOIN teams ht ON ht.id = f.home_team_id
      JOIN teams at ON at.id = f.away_team_id
      LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
      LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
      WHERE ht.name = 'USA' AND at.name = 'Paraguay'
    `).get();
    await expect(hydrateFixtureFromFootballData(db, usa, { apiKey: API_KEY, pass: 'lock' }))
      .resolves.toMatchObject({ matched: true, providerFixtureId: 204602 });
  });
});
