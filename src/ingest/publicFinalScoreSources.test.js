import { describe, it, expect, afterEach } from 'vitest';
import nock from 'nock';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, closeDb } from '../db/db.js';
import { seedStaticData } from '../../scripts/seed-static.js';
import { parseFinalScoreFromHtml, retrievePublicFinalScores } from './publicFinalScoreSources.js';

describe('ingest/publicFinalScoreSources', () => {
  let db;
  let tmpDir;

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (db) closeDb(db);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    db = null;
    tmpDir = null;
  });

  it('parses a trusted ESPN-style final score when teams and final marker match', () => {
    const parsed = parseFinalScoreFromHtml(
      '<html><head><title>Sweden 5-1 Tunisia (Jun 14, 2026) Final Score - ESPN</title></head></html>',
      { homeTeam: 'Sweden', awayTeam: 'Tunisia' },
    );

    expect(parsed).toEqual({ homeScore: 5, awayScore: 1 });
  });

  it('does not parse if the page has no completed/final marker', () => {
    const parsed = parseFinalScoreFromHtml(
      '<html><head><title>Sweden 5-1 Tunisia Preview - ESPN</title></head></html>',
      { homeTeam: 'Sweden', awayTeam: 'Tunisia' },
    );

    expect(parsed).toBeNull();
  });

  it('does not parse if team names do not match the fixture', () => {
    const parsed = parseFinalScoreFromHtml(
      '<html><head><title>Sweden 5-1 Norway Final Score - ESPN</title></head></html>',
      { homeTeam: 'Sweden', awayTeam: 'Tunisia' },
    );

    expect(parsed).toBeNull();
  });

  it('retrieves and applies a configured public final score after T+2h', async () => {
    db = openDb(':memory:');
    seedStaticData(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'final-score-sources-test-'));
    const sourcesPath = join(tmpDir, 'final-score-sources.json');
    writeFileSync(sourcesPath, JSON.stringify([{
      homeTeam: 'Sweden',
      awayTeam: 'Tunisia',
      kickoffLocalDate: '2026-06-14',
      sourceName: 'ESPN',
      sourceUrl: 'https://espn.test/soccer/match/_/gameId/760424',
      parserType: 'espn',
    }]));

    nock.disableNetConnect();
    nock('https://espn.test')
      .get('/soccer/match/_/gameId/760424')
      .reply(200, '<title>Sweden 5-1 Tunisia (Jun 14, 2026) Final Score - ESPN</title>');

    const result = await retrievePublicFinalScores(db, {
      now: '2026-06-15T05:00:00.000Z',
      sourcesPath,
      limit: 1,
    });

    expect(result.applied).toBe(1);
    expect(result.warnings).toEqual([]);
    const row = db.prepare(`
      SELECT final_home_score, final_away_score, final_score_source_name, final_score_source_url
      FROM fixtures f
      JOIN teams h ON h.id = f.home_team_id
      JOIN teams a ON a.id = f.away_team_id
      WHERE h.name = 'Sweden' AND a.name = 'Tunisia'
    `).get();
    expect(row).toEqual({
      final_home_score: 5,
      final_away_score: 1,
      final_score_source_name: 'ESPN',
      final_score_source_url: 'https://espn.test/soccer/match/_/gameId/760424',
    });
  });

  it('warns when a T+2h fixture has no configured public source', async () => {
    db = openDb(':memory:');
    seedStaticData(db);
    tmpDir = mkdtempSync(join(tmpdir(), 'final-score-sources-test-'));
    const sourcesPath = join(tmpDir, 'final-score-sources.json');
    writeFileSync(sourcesPath, JSON.stringify([]));

    const result = await retrievePublicFinalScores(db, {
      now: '2026-06-15T05:00:00.000Z',
      sourcesPath,
      limit: 100,
    });

    expect(result.applied).toBe(0);
    expect(result.warnings).toContain('No public final-score source configured for Sweden vs Tunisia (2026-06-14).');
  });
});
