-- Schema version tracking (migration risk mitigation per plan.md Risks)
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);

-- Teams
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  api_football_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  logo_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fixtures
CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY,
  api_football_id INTEGER UNIQUE NOT NULL,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff_utc TEXT NOT NULL,
  round TEXT,
  stage TEXT NOT NULL DEFAULT 'group',
  status TEXT NOT NULL DEFAULT 'scheduled',
  venue TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Team stats (season form, squad info)
CREATE TABLE IF NOT EXISTS team_stats (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  season TEXT NOT NULL,
  form TEXT,
  goals_scored INTEGER,
  goals_conceded INTEGER,
  data_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(team_id, season)
);

-- Head-to-head records
CREATE TABLE IF NOT EXISTS head_to_head (
  id INTEGER PRIMARY KEY,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(home_team_id, away_team_id)
);

-- Odds (pre-match)
CREATE TABLE IF NOT EXISTS odds (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
  bookmaker TEXT NOT NULL,
  home_win REAL,
  draw REAL,
  away_win REAL,
  data_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fixture_id, bookmaker)
);

-- Articles (one per fixture × article_type)
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
  article_type TEXT NOT NULL DEFAULT 'pronostico_momios',
  status TEXT NOT NULL DEFAULT 'pending',
  content_json TEXT,
  rendered_html TEXT,
  lifecycle_state TEXT DEFAULT NULL,
  last_refreshed_at TEXT DEFAULT NULL,
  wp_post_id INTEGER DEFAULT NULL,
  last_pass TEXT DEFAULT NULL,
  author_id INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fixture_id, article_type)
);

-- Generation log (cost instrumentation — one row per model call)
CREATE TABLE IF NOT EXISTS generation_log (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
  article_type TEXT NOT NULL DEFAULT 'pronostico_momios',
  attempt INTEGER NOT NULL DEFAULT 1,
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  latency_ms INTEGER DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON fixtures(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
CREATE INDEX IF NOT EXISTS idx_articles_lifecycle ON articles(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_articles_fixture_type ON articles(fixture_id, article_type);
CREATE INDEX IF NOT EXISTS idx_generation_log_fixture ON generation_log(fixture_id, article_type);
