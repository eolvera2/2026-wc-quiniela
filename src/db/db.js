import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

/**
 * Opens a SQLite database and applies the schema.
 * Pass ':memory:' for testing.
 * Reference: docs/plan.md "Phase 2 — Data Ingestion"
 */
export function openDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  return db;
}

/**
 * Closes the database connection.
 */
export function closeDb(db) {
  if (db && db.open) {
    db.close();
  }
}

/**
 * Upserts a team by api_football_id.
 */
export function upsertTeam(db, { apiFootballId, name, code, logoUrl }) {
  const stmt = db.prepare(`
    INSERT INTO teams (api_football_id, name, code, logo_url)
    VALUES (@apiFootballId, @name, @code, @logoUrl)
    ON CONFLICT(api_football_id) DO UPDATE SET
      name = excluded.name,
      code = excluded.code,
      logo_url = excluded.logo_url
  `);
  return stmt.run({ apiFootballId, name, code, logoUrl });
}

/**
 * Upserts a fixture by api_football_id.
 * Resolves home/away team internal IDs from api_football_id.
 */
export function upsertFixture(db, { apiFootballId, homeTeamApiId, awayTeamApiId, kickoffUtc, round, stage, status, venue }) {
  const homeTeam = db.prepare("SELECT id FROM teams WHERE api_football_id = ?").get(homeTeamApiId);
  const awayTeam = db.prepare("SELECT id FROM teams WHERE api_football_id = ?").get(awayTeamApiId);
  if (!homeTeam || !awayTeam) {
    throw new Error(`Team not found for api_football_ids: home=${homeTeamApiId}, away=${awayTeamApiId}`);
  }
  const stmt = db.prepare(`
    INSERT INTO fixtures (api_football_id, home_team_id, away_team_id, kickoff_utc, round, stage, status, venue)
    VALUES (@apiFootballId, @homeTeamId, @awayTeamId, @kickoffUtc, @round, @stage, @status, @venue)
    ON CONFLICT(api_football_id) DO UPDATE SET
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      kickoff_utc = excluded.kickoff_utc,
      round = excluded.round,
      stage = excluded.stage,
      status = excluded.status,
      venue = excluded.venue,
      updated_at = datetime('now')
  `);
  return stmt.run({
    apiFootballId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    kickoffUtc,
    round,
    stage,
    status,
    venue,
  });
}

/**
 * Returns all fixtures with a given status.
 */
export function getFixturesByStatus(db, status) {
  return db.prepare("SELECT * FROM fixtures WHERE status = ?").all(status);
}

/**
 * Inserts a generation_log row (one per model call).
 * Reference: docs/plan.md "generation_log" cost instrumentation.
 */
export function insertGenerationLog(db, { fixtureId, articleType, attempt, modelUsed, promptTokens, completionTokens, totalTokens, costUsd, latencyMs, status, errorMessage }) {
  const stmt = db.prepare(`
    INSERT INTO generation_log (fixture_id, article_type, attempt, model_used, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, status, error_message)
    VALUES (@fixtureId, @articleType, @attempt, @modelUsed, @promptTokens, @completionTokens, @totalTokens, @costUsd, @latencyMs, @status, @errorMessage)
  `);
  return stmt.run({
    fixtureId,
    articleType,
    attempt,
    modelUsed,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    latencyMs,
    status,
    errorMessage: errorMessage || null,
  });
}
