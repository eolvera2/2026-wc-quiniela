-- PredictaGol Agent Board schema v1

-- cards: the kanban units
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  stage TEXT NOT NULL,
  owner TEXT NOT NULL,
  pillar TEXT,
  platforms_json TEXT NOT NULL DEFAULT '[]',
  payload_json TEXT NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  stalled_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cards_stage ON cards(stage);
CREATE INDEX IF NOT EXISTS idx_cards_owner ON cards(owner);

-- card_events: append-only history of every stage transition / edit
CREATE TABLE IF NOT EXISTS card_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  note TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_card_events_card ON card_events(card_id);

-- posts: one row per (card, platform) publish attempt result
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  permalink TEXT,
  error TEXT,
  posted_at TIMESTAMP,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_posts_card ON posts(card_id);

-- agent_runs: log of each marketing:* run (Widow pulse, Strange calendar, etc.)
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  cards_created INTEGER NOT NULL DEFAULT 0,
  cards_advanced INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP
);
