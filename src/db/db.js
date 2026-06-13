import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');

const MIGRATIONS = [
  {
    version: 3,
    up: (db) => {
      const migrate = db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            base_url TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS wc_groups (
            id INTEGER PRIMARY KEY,
            group_code TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            source_id INTEGER REFERENCES sources(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS stadiums (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            official_name TEXT NOT NULL,
            tournament_name TEXT,
            city TEXT NOT NULL,
            country_code TEXT NOT NULL,
            timezone TEXT,
            capacity INTEGER,
            wikidata_id TEXT,
            latitude REAL,
            longitude REAL,
            source_id INTEGER REFERENCES sources(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS localized_names (
            id INTEGER PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            locale TEXT NOT NULL,
            name TEXT NOT NULL,
            source_id INTEGER REFERENCES sources(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(entity_type, entity_id, locale)
          );

          CREATE TABLE IF NOT EXISTS provider_id_mappings (
            id INTEGER PRIMARY KEY,
            source_id INTEGER NOT NULL REFERENCES sources(id),
            entity_type TEXT NOT NULL,
            internal_id INTEGER NOT NULL,
            provider_id TEXT NOT NULL,
            extra_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(source_id, entity_type, provider_id)
          );

          CREATE TABLE IF NOT EXISTS fetch_log (
            id INTEGER PRIMARY KEY,
            source_id INTEGER NOT NULL REFERENCES sources(id),
            endpoint TEXT NOT NULL,
            params_hash TEXT,
            params_json TEXT,
            reason TEXT NOT NULL,
            http_status INTEGER,
            response_bytes INTEGER,
            quota_used INTEGER,
            quota_remaining INTEGER,
            duration_ms INTEGER,
            cached INTEGER NOT NULL DEFAULT 0,
            is_negative INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS provider_cache (
            id INTEGER PRIMARY KEY,
            source_id INTEGER NOT NULL REFERENCES sources(id),
            cache_key TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_ref_id INTEGER,
            is_empty INTEGER NOT NULL DEFAULT 0,
            fetched_at TEXT NOT NULL,
            expires_at TEXT,
            http_status INTEGER,
            raw_json TEXT,
            fetch_log_id INTEGER REFERENCES fetch_log(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(source_id, cache_key)
          );

          CREATE INDEX IF NOT EXISTS idx_localized_names_entity
            ON localized_names(entity_type, entity_id);
          CREATE INDEX IF NOT EXISTS idx_provider_id_mappings_lookup
            ON provider_id_mappings(source_id, entity_type, internal_id);
          CREATE INDEX IF NOT EXISTS idx_fetch_log_endpoint_params
            ON fetch_log(source_id, endpoint, params_hash);
          CREATE INDEX IF NOT EXISTS idx_fetch_log_created
            ON fetch_log(created_at);
          CREATE INDEX IF NOT EXISTS idx_provider_cache_expiry
            ON provider_cache(source_id, entity_type, expires_at);
          CREATE INDEX IF NOT EXISTS idx_provider_cache_entity
            ON provider_cache(entity_type, entity_ref_id);
        `);

        for (const sql of [
          'ALTER TABLE fixtures ADD COLUMN group_id INTEGER REFERENCES wc_groups(id)',
          'ALTER TABLE fixtures ADD COLUMN stadium_id INTEGER REFERENCES stadiums(id)',
          'ALTER TABLE fixtures ADD COLUMN match_number INTEGER',
          'ALTER TABLE fixtures ADD COLUMN static_source_id INTEGER REFERENCES sources(id)',
          'ALTER TABLE fixtures ADD COLUMN is_tbd INTEGER NOT NULL DEFAULT 0',
          'ALTER TABLE fixtures ADD COLUMN tbd_home_label TEXT',
          'ALTER TABLE fixtures ADD COLUMN tbd_away_label TEXT',
          'ALTER TABLE fixtures ADD COLUMN post_match_archived INTEGER NOT NULL DEFAULT 0',
          'ALTER TABLE teams ADD COLUMN group_id INTEGER REFERENCES wc_groups(id)',
          'ALTER TABLE teams ADD COLUMN fifa_code TEXT',
          'ALTER TABLE teams ADD COLUMN confederation TEXT',
          'ALTER TABLE teams ADD COLUMN static_source_id INTEGER REFERENCES sources(id)',
        ]) {
          try {
            db.exec(sql);
          } catch (err) {
            if (!String(err.message).includes('duplicate column name')) {
              throw err;
            }
          }
        }

        db.exec(`
          INSERT OR IGNORE INTO sources (id, slug, name, base_url, notes) VALUES
            (1, 'static_wc2026', 'WC2026 Static Seed Data', NULL, 'Preloaded public facts; no API key required'),
            (2, 'footballdata_io', 'FootballData.io API v1', 'https://footballdata.io/api/v1', 'Bearer FOOTBALLDATA_KEY'),
            (3, 'manual', 'Manual Override', NULL, 'Human-corrected values; highest trust');

          INSERT OR IGNORE INTO wc_groups (group_code, label, source_id) VALUES
            ('A', 'Group A', 1), ('B', 'Group B', 1), ('C', 'Group C', 1), ('D', 'Group D', 1),
            ('E', 'Group E', 1), ('F', 'Group F', 1), ('G', 'Group G', 1), ('H', 'Group H', 1),
            ('I', 'Group I', 1), ('J', 'Group J', 1), ('K', 'Group K', 1), ('L', 'Group L', 1);

          INSERT OR IGNORE INTO provider_id_mappings (source_id, entity_type, internal_id, provider_id, extra_json) VALUES
            (2, 'league', 0, '50', '{"name":"World Cup"}'),
            (2, 'season', 0, '618', '{"league_id":50,"year":2026}');
        `);
      });

      migrate();
    },
  },
  {
    version: 4,
    up: (db) => {
      for (const sql of [
        'ALTER TABLE fixtures ADD COLUMN final_home_score INTEGER',
        'ALTER TABLE fixtures ADD COLUMN final_away_score INTEGER',
        'ALTER TABLE fixtures ADD COLUMN final_score_source_name TEXT',
        'ALTER TABLE fixtures ADD COLUMN final_score_source_url TEXT',
        'ALTER TABLE fixtures ADD COLUMN final_score_updated_at TEXT',
      ]) {
        try {
          db.exec(sql);
        } catch (err) {
          if (!String(err.message).includes('duplicate column name')) {
            throw err;
          }
        }
      }
    },
  },
];

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
  applyMigrations(db);
  return db;
}

export function applyMigrations(db) {
  const current = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_version').get().version;
  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      migration.up(db);
      db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(migration.version);
    }
  }
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
