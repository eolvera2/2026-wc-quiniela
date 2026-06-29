import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, closeDb } from '../db/db.js';
import { seedStaticData } from '../../scripts/seed-static.js';
import { applyPublicFinalScoreEntries, applyPublicFinalScores, findMissingPublicFinalScores, findUpcomingPublicFinalScoreWindows } from './publicFinalScores.js';

describe('ingest/publicFinalScores', () => {
  let db;
  let tmpDir;

  afterEach(() => {
    if (db) closeDb(db);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    db = null;
    tmpDir = null;
  });

  it('applies sourced public final scores after kickoff', () => {
    db = openDb(':memory:');
    seedStaticData(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'final-scores-test-'));
    const finalScoresPath = join(tmpDir, 'final-scores.json');
    writeFileSync(finalScoresPath, JSON.stringify([{
      homeTeam: 'Mexico',
      awayTeam: 'South Africa',
      kickoffLocalDate: '2026-06-11',
      homeScore: 2,
      awayScore: 0,
      sourceName: 'FIFA.com',
      sourceUrl: 'https://www.fifa.com/example',
    }]));

    const result = applyPublicFinalScores(db, {
      now: '2026-06-12T00:30:00.000Z',
      finalScoresPath,
    });

    expect(result.applied).toBe(1);
    const row = db.prepare('SELECT status, final_home_score, final_away_score, final_score_source_name, final_score_source_url FROM fixtures WHERE id = 1').get();
    expect(row).toEqual({
      status: 'resolved',
      final_home_score: 2,
      final_away_score: 0,
      final_score_source_name: 'FIFA.com',
      final_score_source_url: 'https://www.fifa.com/example',
    });
  });

  it('does not apply public final scores before kickoff', () => {
    db = openDb(':memory:');
    seedStaticData(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'final-scores-test-'));
    const finalScoresPath = join(tmpDir, 'final-scores.json');
    writeFileSync(finalScoresPath, JSON.stringify([{
      homeTeam: 'Mexico',
      awayTeam: 'South Africa',
      kickoffLocalDate: '2026-06-11',
      homeScore: 2,
      awayScore: 0,
      sourceName: 'FIFA.com',
      sourceUrl: 'https://www.fifa.com/example',
    }]));

    const result = applyPublicFinalScores(db, {
      now: '2026-06-11T18:00:00.000Z',
      finalScoresPath,
    });

    expect(result).toEqual({ applied: 0, skipped: 1 });
    const row = db.prepare('SELECT status, final_home_score, final_away_score FROM fixtures WHERE id = 1').get();
    expect(row.status).toBe('scheduled');
    expect(row.final_home_score).toBeNull();
    expect(row.final_away_score).toBeNull();
  });

  it('does not apply public final scores until the T+2h window', () => {
    db = openDb(':memory:');
    seedStaticData(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'final-scores-test-'));
    const finalScoresPath = join(tmpDir, 'final-scores.json');
    writeFileSync(finalScoresPath, JSON.stringify([{
      homeTeam: 'Mexico',
      awayTeam: 'South Africa',
      kickoffLocalDate: '2026-06-11',
      homeScore: 2,
      awayScore: 0,
      sourceName: 'FIFA.com',
      sourceUrl: 'https://www.fifa.com/example',
    }]));

    const result = applyPublicFinalScores(db, {
      now: '2026-06-11T20:30:00.000Z',
      finalScoresPath,
    });

    expect(result).toEqual({ applied: 0, skipped: 1 });
    const row = db.prepare('SELECT status, final_home_score, final_away_score FROM fixtures WHERE id = 1').get();
    expect(row.status).toBe('scheduled');
    expect(row.final_home_score).toBeNull();
    expect(row.final_away_score).toBeNull();
  });

  it('lists fixtures past T+2h that are missing public final scores', () => {
    db = openDb(':memory:');
    seedStaticData(db);

    const missing = findMissingPublicFinalScores(db, {
      now: '2026-06-14T08:00:00.000Z',
      limit: 5,
    });

    expect(missing.some((fixture) => fixture.homeTeam === 'Brazil' && fixture.awayTeam === 'Morocco')).toBe(true);
    expect(missing.every((fixture) => fixture.kickoffUtc <= '2026-06-14T06:00:00.000Z')).toBe(true);
  });

  it('lists final-score windows that will become eligible soon', () => {
    db = openDb(':memory:');
    seedStaticData(db);

    const upcoming = findUpcomingPublicFinalScoreWindows(db, {
      now: '2026-06-15T23:30:00.000Z',
      lookaheadMinutes: 45,
      limit: 60,
    });

    expect(upcoming).toContainEqual(expect.objectContaining({
      homeTeam: 'Saudi Arabia',
      awayTeam: 'Uruguay',
      kickoffUtc: '2026-06-15T22:00:00.000Z',
      finalScoreEligibleAt: '2026-06-16T00:00:00.000Z',
      minutesUntilEligible: 30,
    }));
  });

  it('advances knockout winners into downstream bracket fixtures when final scores are applied', () => {
    db = openDb(':memory:');
    seedStaticData(db);

    setKnockoutFixtureTeams(db, 74, 'GER', 'PAR');
    setKnockoutFixtureTeams(db, 77, 'FRA', 'SWE');

    const first = applyPublicFinalScoresFromEntries(db, [{
      matchNumber: 74,
      homeScore: 2,
      awayScore: 0,
      sourceName: 'ESPN',
      sourceUrl: 'https://www.espn.com/match/74',
    }]);

    expect(first).toEqual({ applied: 1, skipped: 0, advanced: 1 });
    expect(db.prepare(`
      SELECT is_tbd, h.fifa_code AS homeCode, tbd_home_label, tbd_away_label
      FROM fixtures f
      JOIN teams h ON h.id = f.home_team_id
      WHERE f.match_number = 89
    `).get()).toEqual({
      is_tbd: 1,
      homeCode: 'GER',
      tbd_home_label: 'Alemania',
      tbd_away_label: 'W77',
    });

    seedStaticData(db);
    expect(db.prepare(`
      SELECT is_tbd, h.fifa_code AS homeCode, tbd_home_label, tbd_away_label
      FROM fixtures f
      JOIN teams h ON h.id = f.home_team_id
      WHERE f.match_number = 89
    `).get()).toEqual({
      is_tbd: 1,
      homeCode: 'GER',
      tbd_home_label: 'Alemania',
      tbd_away_label: 'W77',
    });

    const second = applyPublicFinalScoresFromEntries(db, [{
      matchNumber: 77,
      homeScore: 1,
      awayScore: 0,
      sourceName: 'ESPN',
      sourceUrl: 'https://www.espn.com/match/77',
    }]);

    expect(second).toEqual({ applied: 1, skipped: 0, advanced: 2 });
    expect(db.prepare(`
      SELECT f.is_tbd, f.status, h.fifa_code AS homeCode, a.fifa_code AS awayCode,
             f.tbd_home_label, f.tbd_away_label
      FROM fixtures f
      JOIN teams h ON h.id = f.home_team_id
      JOIN teams a ON a.id = f.away_team_id
      WHERE f.match_number = 89
    `).get()).toEqual({
      is_tbd: 0,
      status: 'scheduled',
      homeCode: 'GER',
      awayCode: 'FRA',
      tbd_home_label: null,
      tbd_away_label: null,
    });
  });
});

function applyPublicFinalScoresFromEntries(db, entries) {
  return applyPublicFinalScoreEntries(db, entries, {
    now: '2026-07-02T00:00:00.000Z',
  });
}

function setKnockoutFixtureTeams(db, matchNumber, homeCode, awayCode) {
  const home = db.prepare('SELECT id FROM teams WHERE fifa_code = ?').get(homeCode);
  const away = db.prepare('SELECT id FROM teams WHERE fifa_code = ?').get(awayCode);
  db.prepare(`
    UPDATE fixtures
    SET home_team_id = @homeTeamId,
        away_team_id = @awayTeamId,
        is_tbd = 0,
        status = 'scheduled',
        tbd_home_label = NULL,
        tbd_away_label = NULL
    WHERE match_number = @matchNumber
  `).run({
    matchNumber,
    homeTeamId: home.id,
    awayTeamId: away.id,
  });
}
