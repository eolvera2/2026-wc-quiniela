import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb, upsertFixture, upsertTeam, getFixturesByStatus, insertGenerationLog } from './db.js';

describe('db wrapper', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    closeDb(db);
  });

  it('opens an in-memory DB and applies schema', () => {
    const row = db.prepare("SELECT version FROM schema_version").get();
    expect(row.version).toBe(1);
  });

  it('upserts a team', () => {
    upsertTeam(db, { apiFootballId: 100, name: 'Mexico', code: 'MEX', logoUrl: 'https://logo.png' });
    upsertTeam(db, { apiFootballId: 100, name: 'México', code: 'MEX', logoUrl: 'https://logo2.png' });
    const rows = db.prepare("SELECT * FROM teams WHERE api_football_id = 100").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('México');
  });

  it('upserts a fixture', () => {
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertFixture(db, {
      apiFootballId: 999,
      homeTeamApiId: 1,
      awayTeamApiId: 2,
      kickoffUtc: '2026-06-11T18:00:00Z',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: 'Estadio Azteca',
    });
    const fixtures = getFixturesByStatus(db, 'scheduled');
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].kickoff_utc).toBe('2026-06-11T18:00:00Z');
  });

  it('inserts a generation_log row', () => {
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertFixture(db, {
      apiFootballId: 999,
      homeTeamApiId: 1,
      awayTeamApiId: 2,
      kickoffUtc: '2026-06-11T18:00:00Z',
      round: 'Group A - 1',
      stage: 'group',
      status: 'scheduled',
      venue: null,
    });
    const fixture = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 999").get();
    insertGenerationLog(db, {
      fixtureId: fixture.id,
      articleType: 'pronostico_momios',
      attempt: 1,
      modelUsed: 'claude-opus',
      promptTokens: 1200,
      completionTokens: 800,
      totalTokens: 2000,
      costUsd: 0.042,
      latencyMs: 3200,
      status: 'success',
    });
    const logs = db.prepare("SELECT * FROM generation_log WHERE fixture_id = ?").all(fixture.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].cost_usd).toBe(0.042);
    expect(logs[0].model_used).toBe('claude-opus');
  });
});
