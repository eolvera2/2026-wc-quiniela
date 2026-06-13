import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, closeDb } from '../db/db.js';
import { seedStaticData } from '../../scripts/seed-static.js';
import { applyPublicFinalScores } from './publicFinalScores.js';

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
});
