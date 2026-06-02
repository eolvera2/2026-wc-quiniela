# Phase 1: Pure-Logic Core Implementation Plan

> **Execution:** Use the subagent-driven-development workflow to implement this plan.

**Goal:** Build and test the dependency-light, pure-logic core of the WC26 Quiniela pipeline — everything that can run WITHOUT external service credentials (no Azure, no API-Football, no WordPress, no Azure Blob Storage).

**Architecture:** A Node.js ESM project using `better-sqlite3` for local persistence, `zod` for schema validation, and `vitest` for testing. All modules are pure functions or thin wrappers over SQLite — no network calls in this phase.

**Tech Stack:** Node.js 18+ (ESM), better-sqlite3, vitest, zod

**Reference:** All design decisions trace back to `docs/plan.md` sections by name.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.js`
- Create: `src/config/index.js`
- Create: `src/config/index.test.js`

**Step 1: Create `package.json`**

```json
{
  "name": "wc26-quiniela",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "cost-report": "node scripts/cost-report.js"
  },
  "dependencies": {
    "better-sqlite3": "11.7.0",
    "dotenv": "16.4.7",
    "p-limit": "6.2.0",
    "zod": "3.24.2"
  },
  "devDependencies": {
    "vitest": "3.1.1"
  }
}
```

**Step 2: Create `.gitignore`**

```
node_modules/
/data/*.sqlite
/data/*.sqlite-journal
.env
*.log
dist/
coverage/
```

**Step 3: Create `.env.example`**

```bash
# Azure AI Foundry (model router)
AZURE_AI_ENDPOINT=https://your-project.openai.azure.com/
AZURE_AI_KEY=your-key-here

# API-Football (RapidAPI)
RAPIDAPI_KEY=your-rapidapi-key

# WordPress
WP_BASE_URL=https://your-site.com
WP_APP_PASSWORD=your-app-password

# Azure Blob Storage (DB persistence)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...

# Affiliate URLs
CALIENTE_AFFILIATE_URL=https://www.caliente.mx/ref/YOUR_ID
BET365_AFFILIATE_URL=https://www.bet365.mx/ref/YOUR_ID
SKIMLINKS_AFFILIATE_URL=https://go.skimresources.com/?id=YOUR_ID&url=
```

**Step 4: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
  },
});
```

**Step 5: Create `src/config/index.js`**

```js
import 'dotenv/config';

/**
 * Loads environment variables with defaults for optional values.
 * Required secrets throw on access if missing (fail-fast).
 * Reference: docs/plan.md "Phase 1 — Environment & Routing Setup"
 */
export function loadConfig() {
  return {
    azureAiEndpoint: env('AZURE_AI_ENDPOINT'),
    azureAiKey: env('AZURE_AI_KEY'),
    rapidApiKey: env('RAPIDAPI_KEY'),
    wpBaseUrl: env('WP_BASE_URL'),
    wpAppPassword: env('WP_APP_PASSWORD'),
    azureStorageConnectionString: env('AZURE_STORAGE_CONNECTION_STRING'),
    calienteAffiliateUrl: env('CALIENTE_AFFILIATE_URL'),
    bet365AffiliateUrl: env('BET365_AFFILIATE_URL'),
    skimlinksAffiliateUrl: env('SKIMLINKS_AFFILIATE_URL'),
    activeArticleTypes: (process.env.ACTIVE_ARTICLE_TYPES || 'pronostico_momios').split(','),
    dbPath: process.env.DB_PATH || 'data/wc26.sqlite',
  };
}

function env(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
```

**Step 6: Create `src/config/index.test.js`**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './index.js';

describe('config/index', () => {
  const REQUIRED_VARS = {
    AZURE_AI_ENDPOINT: 'https://test.openai.azure.com/',
    AZURE_AI_KEY: 'test-key',
    RAPIDAPI_KEY: 'test-rapid',
    WP_BASE_URL: 'https://test.com',
    WP_APP_PASSWORD: 'test-pass',
    AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=test',
    CALIENTE_AFFILIATE_URL: 'https://caliente.mx/ref/test',
    BET365_AFFILIATE_URL: 'https://bet365.mx/ref/test',
    SKIMLINKS_AFFILIATE_URL: 'https://go.skimresources.com/?id=test',
  };

  beforeEach(() => {
    Object.entries(REQUIRED_VARS).forEach(([k, v]) => { process.env[k] = v; });
  });

  afterEach(() => {
    Object.keys(REQUIRED_VARS).forEach((k) => { delete process.env[k]; });
    delete process.env.ACTIVE_ARTICLE_TYPES;
    delete process.env.DB_PATH;
  });

  it('loads all required env vars', () => {
    const config = loadConfig();
    expect(config.azureAiEndpoint).toBe('https://test.openai.azure.com/');
    expect(config.azureAiKey).toBe('test-key');
    expect(config.rapidApiKey).toBe('test-rapid');
  });

  it('throws when a required var is missing', () => {
    delete process.env.AZURE_AI_KEY;
    expect(() => loadConfig()).toThrow('Missing required environment variable: AZURE_AI_KEY');
  });

  it('defaults activeArticleTypes to pronostico_momios', () => {
    const config = loadConfig();
    expect(config.activeArticleTypes).toEqual(['pronostico_momios']);
  });

  it('parses ACTIVE_ARTICLE_TYPES as comma-separated', () => {
    process.env.ACTIVE_ARTICLE_TYPES = 'pronostico_momios,alineacion_probable';
    const config = loadConfig();
    expect(config.activeArticleTypes).toEqual(['pronostico_momios', 'alineacion_probable']);
  });

  it('defaults dbPath to data/wc26.sqlite', () => {
    const config = loadConfig();
    expect(config.dbPath).toBe('data/wc26.sqlite');
  });
});
```

**Step 7: Run tests to verify they pass**

```bash
npm ci
npx vitest run src/config/index.test.js
```

Expected: 5 tests PASS

**Step 8: Commit**

```bash
git add -A && git commit -m "feat: project scaffold with config loader and vitest"
```

---

## Task 2: Database Schema

**Files:**
- Create: `src/db/schema.sql`
- Create: `data/.gitkeep`

**Step 1: Create `data/.gitkeep`**

Empty file — ensures the `data/` directory is tracked by git while the `.sqlite` files are ignored.

**Step 2: Create `src/db/schema.sql`**

Reference: `docs/plan.md` "Phase 2 — Data Ingestion" schema section + "generation_log" cost instrumentation.

```sql
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
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: SQLite schema with all tables and cost instrumentation"
```

---

## Task 3: Database Wrapper (`db.js`)

**Files:**
- Create: `src/db/db.js`
- Create: `src/db/db.test.js`

**Step 1: Write the failing test `src/db/db.test.js`**

```js
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
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/db/db.test.js
```

Expected: FAIL — `Cannot find module './db.js'`

**Step 3: Write implementation `src/db/db.js`**

```js
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
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/db/db.test.js
```

Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: db wrapper with schema migration, upsert helpers, generation_log"
```

---

## Task 4: Pricing Module

**Files:**
- Create: `src/generate/pricing.js`
- Create: `src/generate/pricing.test.js`

**Step 1: Write the failing test `src/generate/pricing.test.js`**

Reference: `docs/plan.md` "Phase 3 — Generation Engine" cost capture + "config/pricing.js" rate table.

```js
import { describe, it, expect } from 'vitest';
import { costOf, PRICING } from './pricing.js';

describe('pricing', () => {
  it('exports a pricing table with known models', () => {
    expect(PRICING['claude-opus']).toBeDefined();
    expect(PRICING['gpt-4o-mini']).toBeDefined();
  });

  it('calculates cost for claude-opus', () => {
    // Opus: $15/1M input, $75/1M output (Azure AI Foundry pricing)
    const cost = costOf('claude-opus', 1000, 500);
    expect(cost).toBeCloseTo(0.015 + 0.0375, 6); // 0.0525
  });

  it('calculates cost for gpt-4o-mini', () => {
    // 4o-mini: $0.15/1M input, $0.60/1M output
    const cost = costOf('gpt-4o-mini', 1000, 500);
    expect(cost).toBeCloseTo(0.00015 + 0.0003, 6); // 0.00045
  });

  it('returns 0 for zero tokens', () => {
    expect(costOf('claude-opus', 0, 0)).toBe(0);
  });

  it('throws for unknown model', () => {
    expect(() => costOf('unknown-model', 100, 100)).toThrow('Unknown model: unknown-model');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/generate/pricing.test.js
```

Expected: FAIL — `Cannot find module './pricing.js'`

**Step 3: Write implementation `src/generate/pricing.js`**

```js
/**
 * Per-model token → USD rate table.
 * Rates are per-token (divide $/1M by 1_000_000).
 * Update these when Azure pricing changes; reconcile against portal billing.
 * Reference: docs/plan.md "config/pricing.js" + Phase 5 cost-report reconciliation.
 */
export const PRICING = {
  'claude-opus': {
    inputPerToken: 15 / 1_000_000,   // $15 per 1M input tokens
    outputPerToken: 75 / 1_000_000,  // $75 per 1M output tokens
  },
  'gpt-4o-mini': {
    inputPerToken: 0.15 / 1_000_000,  // $0.15 per 1M input tokens
    outputPerToken: 0.60 / 1_000_000, // $0.60 per 1M output tokens
  },
};

/**
 * Compute USD cost for a single model call.
 * @param {string} model - Model identifier (must match PRICING keys)
 * @param {number} promptTokens - Input/prompt token count
 * @param {number} completionTokens - Output/completion token count
 * @returns {number} Cost in USD
 */
export function costOf(model, promptTokens, completionTokens) {
  const rates = PRICING[model];
  if (!rates) {
    throw new Error(`Unknown model: ${model}. Known models: ${Object.keys(PRICING).join(', ')}`);
  }
  return (promptTokens * rates.inputPerToken) + (completionTokens * rates.outputPerToken);
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/generate/pricing.test.js
```

Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: pricing module with per-model token rate table"
```

---

## Task 5: Affiliate Injector

**Files:**
- Create: `src/publish/affiliateInjector.js`
- Create: `src/publish/affiliateInjector.test.js`

**Step 1: Write the failing test `src/publish/affiliateInjector.test.js`**

Reference: `docs/plan.md` "Phase 4 — CMS Integration & Affiliate Monetization", affiliateInjector.js spec.

```js
import { describe, it, expect } from 'vitest';
import { injectAffiliateLinks } from './affiliateInjector.js';

const AFFILIATE_URLS = {
  caliente: 'https://caliente.mx/ref/TEST',
  bet365: 'https://bet365.mx/ref/TEST',
  skimlinks: 'https://go.skimresources.com/?id=TEST&url=',
};

describe('affiliateInjector', () => {
  it('wraps first "momios" with Caliente link', () => {
    const html = '<p>Los momios favorecen al equipo local. Los momios cambian.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">momios</a>`);
    // Only first occurrence
    const matches = result.match(/rel="sponsored"/g);
    expect(matches.length).toBeLessThanOrEqual(3); // max 3 groups
  });

  it('wraps first "apostar" with Caliente link (case-insensitive)', () => {
    const html = '<p>Puedes Apostar en este partido.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">Apostar</a>`);
  });

  it('wraps first "apuesta" with Caliente link', () => {
    const html = '<p>La apuesta segura es el over 2.5.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">apuesta</a>`);
  });

  it('wraps first "Caliente" with Caliente link', () => {
    const html = '<p>Revisa las cuotas en Caliente para más opciones.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://caliente.mx/ref/TEST" rel="sponsored">Caliente</a>`);
  });

  it('wraps first "pronóstico" with Bet365 link (accent-insensitive)', () => {
    const html = '<p>Nuestro pronostico para el partido es...</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://bet365.mx/ref/TEST" rel="sponsored">pronostico</a>`);
  });

  it('wraps first "juega" with Bet365 link', () => {
    const html = '<p>Juega con responsabilidad siempre.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://bet365.mx/ref/TEST" rel="sponsored">Juega</a>`);
  });

  it('wraps first "la verde" with Skimlinks link', () => {
    const html = '<p>La Verde llega en buena forma al torneo.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">La Verde</a>`);
  });

  it('wraps first "jersey" with Skimlinks link', () => {
    const html = '<p>Consigue el jersey oficial de la selección.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">jersey</a>`);
  });

  it('wraps first "Nike" with Skimlinks link', () => {
    const html = '<p>Nike presentó la nueva equipación.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toContain(`<a href="https://go.skimresources.com/?id=TEST&url=" rel="sponsored">Nike</a>`);
  });

  it('only wraps first match per trigger group', () => {
    const html = '<p>Los momios son claros. Otros momios también. La apuesta principal es clara.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    // Caliente group: momios, apostar, apuesta, Caliente — only FIRST match across all triggers in group
    const calienteLinks = (result.match(/caliente\.mx\/ref\/TEST/g) || []);
    expect(calienteLinks).toHaveLength(1);
  });

  it('does not inject inside existing <a> tags', () => {
    const html = '<p><a href="https://other.com">momios aquí</a> y momios fuera.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    // Should wrap the second "momios" (outside the tag), not the one inside
    expect(result).toContain('caliente.mx/ref/TEST');
  });

  it('returns unchanged HTML if no triggers match', () => {
    const html = '<p>Un partido sin palabras clave relevantes.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    expect(result).toBe(html);
  });

  it('all injected links have rel="sponsored"', () => {
    const html = '<p>Los momios del pronóstico con el jersey de Nike.</p>';
    const result = injectAffiliateLinks(html, AFFILIATE_URLS);
    const links = result.match(/<a [^>]*>/g) || [];
    for (const link of links) {
      expect(link).toContain('rel="sponsored"');
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/publish/affiliateInjector.test.js
```

Expected: FAIL — `Cannot find module './affiliateInjector.js'`

**Step 3: Write implementation `src/publish/affiliateInjector.js`**

```js
/**
 * Affiliate link injector — pure regex logic.
 * Wraps the FIRST occurrence of each trigger group's keywords with the
 * corresponding affiliate <a> tag (rel="sponsored").
 *
 * Groups (from docs/plan.md Phase 4):
 *   Caliente: momios | apostar | apuesta | Caliente
 *   Bet365:   pronóstico/pronostico | juega
 *   Skimlinks: la verde | jersey | Nike
 *
 * Rules:
 *   - Case/accent insensitive matching
 *   - Only first match per trigger GROUP (not per keyword)
 *   - Adds rel="sponsored" (Google requirement)
 *   - Does not inject inside existing <a>...</a> tags
 */

/**
 * @param {string} html - The article HTML content
 * @param {{ caliente: string, bet365: string, skimlinks: string }} urls - Affiliate URLs
 * @returns {string} HTML with affiliate links injected
 */
export function injectAffiliateLinks(html, urls) {
  const groups = [
    {
      pattern: /momios|apostar|apuesta|caliente/i,
      url: urls.caliente,
    },
    {
      // Match pronóstico OR pronostico (accent-insensitive)
      pattern: /pron[oó]stico|juega/i,
      url: urls.bet365,
    },
    {
      pattern: /la verde|jersey|nike/i,
      url: urls.skimlinks,
    },
  ];

  let result = html;

  for (const group of groups) {
    result = replaceFirstOutsideLinks(result, group.pattern, group.url);
  }

  return result;
}

/**
 * Replaces the first occurrence of `pattern` that is NOT inside an <a>...</a> tag.
 */
function replaceFirstOutsideLinks(html, pattern, url) {
  // Split by <a ...>...</a> segments to avoid injecting inside links
  // Strategy: walk through HTML, find segments outside <a> tags, apply replacement to first match found
  let replaced = false;
  let result = '';
  let cursor = 0;

  // Regex to find <a ...>...</a> blocks (non-greedy)
  const linkRegex = /<a\s[^>]*>[\s\S]*?<\/a>/gi;
  let linkMatch;

  const linkPositions = [];
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    linkPositions.push({ start: linkMatch.index, end: linkMatch.index + linkMatch[0].length });
  }

  // Process segments between links
  let segStart = 0;
  const segments = [];

  for (const pos of linkPositions) {
    if (pos.start > segStart) {
      segments.push({ type: 'text', content: html.slice(segStart, pos.start) });
    }
    segments.push({ type: 'link', content: html.slice(pos.start, pos.end) });
    segStart = pos.end;
  }
  if (segStart < html.length) {
    segments.push({ type: 'text', content: html.slice(segStart) });
  }

  // If no link segments found, treat whole thing as text
  if (segments.length === 0) {
    segments.push({ type: 'text', content: html });
  }

  // Replace first match in text segments only
  for (const seg of segments) {
    if (seg.type === 'link' || replaced) {
      result += seg.content;
    } else {
      const match = seg.content.match(pattern);
      if (match) {
        const idx = match.index;
        const matchedText = match[0];
        const replacement = `<a href="${url}" rel="sponsored">${matchedText}</a>`;
        result += seg.content.slice(0, idx) + replacement + seg.content.slice(idx + matchedText.length);
        replaced = true;
      } else {
        result += seg.content;
      }
    }
  }

  return result;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/publish/affiliateInjector.test.js
```

Expected: 12 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: affiliate injector with case/accent-insensitive regex, rel=sponsored"
```

---

## Task 6: Cost Report Module

**Files:**
- Create: `src/generate/costReport.js`
- Create: `src/generate/costReport.test.js`

**Step 1: Write the failing test `src/generate/costReport.test.js`**

Reference: `docs/plan.md` "Phase 5 — Execution & Indexing" `scripts/cost-report.js` spec.

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, closeDb, upsertTeam, upsertFixture, insertGenerationLog } from '../db/db.js';
import { generateCostReport } from './costReport.js';

describe('costReport', () => {
  let db;

  beforeEach(() => {
    db = openDb(':memory:');
    // Seed two teams and two fixtures
    upsertTeam(db, { apiFootballId: 1, name: 'Mexico', code: 'MEX', logoUrl: null });
    upsertTeam(db, { apiFootballId: 2, name: 'Germany', code: 'GER', logoUrl: null });
    upsertTeam(db, { apiFootballId: 3, name: 'Brazil', code: 'BRA', logoUrl: null });
    upsertFixture(db, { apiFootballId: 100, homeTeamApiId: 1, awayTeamApiId: 2, kickoffUtc: '2026-06-11T18:00:00Z', round: 'Group A - 1', stage: 'group', status: 'scheduled', venue: null });
    upsertFixture(db, { apiFootballId: 101, homeTeamApiId: 1, awayTeamApiId: 3, kickoffUtc: '2026-06-15T18:00:00Z', round: 'Group A - 2', stage: 'group', status: 'scheduled', venue: null });
  });

  afterEach(() => {
    closeDb(db);
  });

  it('returns empty report when no logs exist', () => {
    const report = generateCostReport(db);
    expect(report.totalSpend).toBe(0);
    expect(report.articlesGenerated).toBe(0);
    expect(report.costPerArticle).toBe(0);
    expect(report.costPerArticleFullyLoaded).toBe(0);
    expect(report.modelSplit).toEqual({});
  });

  it('computes cost-per-article across successful generations', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    const f2 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 101").get();

    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });
    insertGenerationLog(db, { fixtureId: f2.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.001, latencyMs: 1500, status: 'success' });

    const report = generateCostReport(db);
    expect(report.articlesGenerated).toBe(2);
    expect(report.totalSpend).toBeCloseTo(0.051, 4);
    expect(report.costPerArticle).toBeCloseTo(0.0255, 4);
  });

  it('includes failed attempts in fully-loaded cost', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();

    // Failed attempt
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 100, totalTokens: 1100, costUsd: 0.02, latencyMs: 5000, status: 'failed', errorMessage: 'timeout' });
    // Successful retry
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 2, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });

    const report = generateCostReport(db);
    expect(report.articlesGenerated).toBe(1);
    // Clean cost = only successful attempts for articles that succeeded
    expect(report.costPerArticle).toBeCloseTo(0.05, 4);
    // Fully loaded = ALL attempts (including failed) / successful articles
    expect(report.costPerArticleFullyLoaded).toBeCloseTo(0.07, 4);
  });

  it('computes model split by calls and spend', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    const f2 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 101").get();

    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });
    insertGenerationLog(db, { fixtureId: f2.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.001, latencyMs: 1500, status: 'success' });

    const report = generateCostReport(db);
    expect(report.modelSplit['claude-opus'].callPercent).toBeCloseTo(50, 0);
    expect(report.modelSplit['gpt-4o-mini'].callPercent).toBeCloseTo(50, 0);
    // Spend split heavily favors opus
    expect(report.modelSplit['claude-opus'].spendPercent).toBeGreaterThan(90);
  });

  it('projects v2 cost for 4 article types', () => {
    const f1 = db.prepare("SELECT id FROM fixtures WHERE api_football_id = 100").get();
    insertGenerationLog(db, { fixtureId: f1.id, articleType: 'pronostico_momios', attempt: 1, modelUsed: 'claude-opus', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, costUsd: 0.05, latencyMs: 3000, status: 'success' });

    const report = generateCostReport(db, { totalFixtures: 64, articleTypesCount: 4, passesPerArticle: 3 });
    // Projection: costPerArticleFullyLoaded × 64 fixtures × 4 types × 3 passes
    expect(report.projection.v2TotalEstimate).toBeCloseTo(0.05 * 64 * 4 * 3, 2);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/generate/costReport.test.js
```

Expected: FAIL — `Cannot find module './costReport.js'`

**Step 3: Write implementation `src/generate/costReport.js`**

```js
/**
 * Cost report aggregation — pure queries over generation_log.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" cost-report spec.
 *
 * Reports:
 *   - Cost-per-article (clean: only successful attempt costs / successful articles)
 *   - Cost-per-article fully-loaded (all attempts including failures / successful articles)
 *   - Model split (% calls and % spend per model)
 *   - Totals
 *   - V2 projection (cost × fixtures × article types × passes)
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ totalFixtures?: number, articleTypesCount?: number, passesPerArticle?: number }} [projectionParams]
 * @returns {object} Cost report
 */
export function generateCostReport(db, projectionParams = {}) {
  const { totalFixtures = 64, articleTypesCount = 4, passesPerArticle = 3 } = projectionParams;

  // Total spend (all attempts)
  const totalRow = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total_spend,
           COUNT(*) as total_calls
    FROM generation_log
  `).get();

  // Successful spend only
  const successRow = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as success_spend
    FROM generation_log
    WHERE status = 'success'
  `).get();

  // Count distinct successful articles
  const articlesRow = db.prepare(`
    SELECT COUNT(DISTINCT fixture_id || '|' || article_type) as count
    FROM generation_log
    WHERE status = 'success'
  `).get();

  const articlesGenerated = articlesRow.count;
  const totalSpend = totalRow.total_spend;
  const successSpend = successRow.success_spend;

  const costPerArticle = articlesGenerated > 0 ? successSpend / articlesGenerated : 0;
  const costPerArticleFullyLoaded = articlesGenerated > 0 ? totalSpend / articlesGenerated : 0;

  // Model split
  const modelRows = db.prepare(`
    SELECT model_used,
           COUNT(*) as calls,
           COALESCE(SUM(cost_usd), 0) as spend
    FROM generation_log
    GROUP BY model_used
  `).all();

  const totalCalls = modelRows.reduce((sum, r) => sum + r.calls, 0);
  const totalModelSpend = modelRows.reduce((sum, r) => sum + r.spend, 0);

  const modelSplit = {};
  for (const row of modelRows) {
    modelSplit[row.model_used] = {
      calls: row.calls,
      callPercent: totalCalls > 0 ? (row.calls / totalCalls) * 100 : 0,
      spend: row.spend,
      spendPercent: totalModelSpend > 0 ? (row.spend / totalModelSpend) * 100 : 0,
    };
  }

  // Projection
  const projection = {
    totalFixtures,
    articleTypesCount,
    passesPerArticle,
    v2TotalEstimate: costPerArticleFullyLoaded * totalFixtures * articleTypesCount * passesPerArticle,
  };

  return {
    totalSpend,
    articlesGenerated,
    costPerArticle,
    costPerArticleFullyLoaded,
    modelSplit,
    projection,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/generate/costReport.test.js
```

Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: cost report module with model split, projections, fully-loaded waste tracking"
```

---

## Task 7: Cadence Pass Selector

**Files:**
- Create: `src/cadence/selectPass.js`
- Create: `src/cadence/selectPass.test.js`

**Step 1: Write the failing test `src/cadence/selectPass.test.js`**

Reference: `docs/plan.md` "Publishing Cadence & Lifecycle" — T-10 seed, T-2 refresh, T-3h lock, tolerance windows, knockout clamp.

```js
import { describe, it, expect } from 'vitest';
import { selectPass } from './selectPass.js';

describe('selectPass', () => {
  // Helper: create a date N days/hours before kickoff
  const kickoff = '2026-06-11T18:00:00Z';
  const daysBeforeKickoff = (days) => new Date(new Date(kickoff).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const hoursBeforeKickoff = (hours) => new Date(new Date(kickoff).getTime() - hours * 60 * 60 * 1000).toISOString();

  it('returns "seed" when now is T-10 days or closer and no state', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(10) });
    expect(result).toBe('seed');
  });

  it('returns "seed" when now is T-9 (past threshold, tolerance window)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(9) });
    expect(result).toBe('seed');
  });

  it('returns null when now is T-12 (too early for any pass)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(12) });
    expect(result).toBeNull();
  });

  it('returns "refresh" when now is T-2 days and state is "seeded"', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(2) });
    expect(result).toBe('refresh');
  });

  it('returns "refresh" when now is T-1 day (past threshold, self-healing)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(1) });
    expect(result).toBe('refresh');
  });

  it('returns null when state is "seeded" but T-5 (not yet T-2)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(5) });
    expect(result).toBeNull();
  });

  it('returns "lock" when now is T-3h and state is "refreshed"', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(3) });
    expect(result).toBe('lock');
  });

  it('returns "lock" when now is T-1h (past threshold, self-healing)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(1) });
    expect(result).toBe('lock');
  });

  it('returns null when state is "refreshed" but T-6h (not yet T-5h window)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'refreshed', now: hoursBeforeKickoff(6) });
    expect(result).toBeNull();
  });

  it('returns null when already "locked" (fully processed)', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'locked', now: hoursBeforeKickoff(1) });
    expect(result).toBeNull();
  });

  it('returns null for past kickoffs (no retroactive processing)', () => {
    const pastKickoff = '2026-05-01T18:00:00Z';
    const result = selectPass({ kickoffUtc: pastKickoff, lifecycleState: null, now: '2026-06-01T00:00:00Z' });
    expect(result).toBeNull();
  });

  // Knockout clamp: fixture resolved inside T-10 seeds immediately
  it('returns "seed" immediately for knockout fixture resolved inside T-10', () => {
    // Knockout fixture with kickoff in 4 days (resolved inside T-10 window)
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: null, now: daysBeforeKickoff(4) });
    expect(result).toBe('seed');
  });

  // Knockout compressed: seed + refresh can be close together
  it('returns "refresh" when seeded and already at T-2', () => {
    const result = selectPass({ kickoffUtc: kickoff, lifecycleState: 'seeded', now: daysBeforeKickoff(2) });
    expect(result).toBe('refresh');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/cadence/selectPass.test.js
```

Expected: FAIL — `Cannot find module './selectPass.js'`

**Step 3: Write implementation `src/cadence/selectPass.js`**

```js
/**
 * Cadence pass selector — pure function.
 * Given a fixture's kickoff_utc, current time, and lifecycle_state,
 * determines which pass (if any) is due.
 *
 * Reference: docs/plan.md "Publishing Cadence & Lifecycle"
 *
 * Thresholds:
 *   Seed:    T-10 days (trigger when ≤10 days to kickoff)
 *   Refresh: T-2 days  (trigger when ≤2 days to kickoff)
 *   Lock:    T-5 hours (trigger when ≤5 hours to kickoff — scheduled at T-4h to catch T-3h)
 *
 * Self-healing: once past a threshold, the pass remains due until executed.
 * This means a missed cron tick self-heals on the next run.
 *
 * Knockout clamp: a fixture resolved inside T-10 seeds immediately (the
 * threshold check handles this naturally — if ≤10 days, seed is due).
 *
 * Does NOT process past kickoffs (no retroactive generation).
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Thresholds in milliseconds before kickoff
const SEED_THRESHOLD = 10 * MS_PER_DAY;
const REFRESH_THRESHOLD = 2 * MS_PER_DAY;
const LOCK_THRESHOLD = 5 * MS_PER_HOUR;

/**
 * @param {{ kickoffUtc: string, lifecycleState: string|null, now: string }} params
 * @returns {'seed' | 'refresh' | 'lock' | null}
 */
export function selectPass({ kickoffUtc, lifecycleState, now }) {
  const kickoffMs = new Date(kickoffUtc).getTime();
  const nowMs = new Date(now).getTime();
  const timeUntilKickoff = kickoffMs - nowMs;

  // Don't process past kickoffs
  if (timeUntilKickoff <= 0) {
    return null;
  }

  // Already fully processed
  if (lifecycleState === 'locked') {
    return null;
  }

  // State machine: determine what's due based on current state + time
  if (lifecycleState === null || lifecycleState === undefined) {
    // Not yet seeded — seed is due if within threshold
    if (timeUntilKickoff <= SEED_THRESHOLD) {
      return 'seed';
    }
    return null;
  }

  if (lifecycleState === 'seeded') {
    // Refresh is due if within threshold
    if (timeUntilKickoff <= REFRESH_THRESHOLD) {
      return 'refresh';
    }
    return null;
  }

  if (lifecycleState === 'refreshed') {
    // Lock is due if within threshold (T-5h window, scheduled at T-4h)
    if (timeUntilKickoff <= LOCK_THRESHOLD) {
      return 'lock';
    }
    return null;
  }

  return null;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/cadence/selectPass.test.js
```

Expected: 13 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: cadence pass selector with T-10/T-2/T-5h thresholds, self-healing"
```

---

## Task 8: Prompt Assembly Module

**Files:**
- Create: `src/generate/prompt.js`
- Create: `src/generate/prompt.test.js`

**Step 1: Write the failing test `src/generate/prompt.test.js`**

Reference: `docs/plan.md` "Phase 3 — Generation Engine" prompt.js spec + "AI & Agentic Discoverability" answer-first structure + "Legal & Compliance" disclaimers.

```js
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, DISCLAIMER_FOOTER } from './prompt.js';

describe('prompt', () => {
  describe('buildSystemPrompt', () => {
    it('returns a Spanish system prompt for pronostico_momios', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('momios');
      expect(prompt).toContain('TUDN');
      expect(prompt).toContain('TV Azteca');
      // MX vernacular markers
      expect(prompt).toContain('el Tri');
      expect(prompt).toContain('la afición');
    });

    it('includes answer-first instruction (GEO/AEO)', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/primeras.*oraciones.*responder/i);
    });

    it('includes TL;DR / Puntos Clave instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/Puntos Clave/);
    });

    it('includes question-phrased H2 instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toMatch(/H2.*pregunta/i);
    });

    it('includes JSON output schema instruction', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('h1_title');
      expect(prompt).toContain('meta_description');
      expect(prompt).toContain('analisis_tactico_html');
      expect(prompt).toContain('pronostico_quiniela');
      expect(prompt).toContain('url_slug');
    });

    it('varies instructions by article_type', () => {
      const momios = buildSystemPrompt('pronostico_momios');
      const alineacion = buildSystemPrompt('alineacion_probable');
      expect(momios).not.toBe(alineacion);
      expect(alineacion).toContain('alineación probable');
    });

    it('includes banned-language list', () => {
      const prompt = buildSystemPrompt('pronostico_momios');
      expect(prompt).toContain('ganador garantizado');
      expect(prompt).toContain('100% seguro');
    });
  });

  describe('buildUserPrompt', () => {
    it('injects match data placeholders', () => {
      const data = {
        teamA: 'México',
        teamB: 'Alemania',
        h2h: '3 wins, 1 draw, 2 losses',
        form: 'WWDLW',
        injuries: 'Raúl Jiménez (knee)',
        odds: { home: 2.10, draw: 3.40, away: 3.50 },
        kickoffUtc: '2026-06-11T18:00:00Z',
      };
      const prompt = buildUserPrompt(data);
      expect(prompt).toContain('México');
      expect(prompt).toContain('Alemania');
      expect(prompt).toContain('3 wins');
      expect(prompt).toContain('Raúl Jiménez');
      expect(prompt).toContain('2.10');
    });
  });

  describe('DISCLAIMER_FOOTER', () => {
    it('contains Spanish disclaimer', () => {
      expect(DISCLAIMER_FOOTER).toContain('entretenimiento e información únicamente');
    });

    it('contains English disclaimer', () => {
      expect(DISCLAIMER_FOOTER).toContain('entertainment and informational purposes only');
    });

    it('contains responsible gambling resources', () => {
      expect(DISCLAIMER_FOOTER).toContain('1-800-697-3735');
      expect(DISCLAIMER_FOOTER).toContain('cij.org.mx');
    });

    it('contains affiliate disclosure', () => {
      expect(DISCLAIMER_FOOTER).toContain('comisión');
    });

    it('contains age gate', () => {
      expect(DISCLAIMER_FOOTER).toContain('18+');
      expect(DISCLAIMER_FOOTER).toContain('21+');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/generate/prompt.test.js
```

Expected: FAIL — `Cannot find module './prompt.js'`

**Step 3: Write implementation `src/generate/prompt.js`**

```js
/**
 * Prompt assembly for the WC26 article generation engine.
 *
 * Reference: docs/plan.md "Phase 3 — Generation Engine" + "AI & Agentic Discoverability"
 * + "Legal & Compliance (Entertainment Positioning)"
 *
 * Key requirements:
 * - Seasoned TUDN/TV Azteca analyst voice, Mexican Spanish vernacular
 * - Answer-first content structure (GEO/AEO optimization)
 * - Question-phrased H2s
 * - "Puntos Clave" TL;DR block
 * - JSON output schema (h1_title, meta_description, analisis_tactico_html, pronostico_quiniela, url_slug)
 * - Banned-language enforcement
 * - Per-article_type task variants
 */

/**
 * Disclaimer footer injected into every published page by wordpress.js.
 * Reference: docs/plan.md "Legal & Compliance" section.
 */
export const DISCLAIMER_FOOTER = `
<div class="disclaimer-footer" style="margin-top:2em;padding:1em;border-top:1px solid #ccc;font-size:0.85em;color:#666;">
  <p><strong>Aviso legal:</strong> Este sitio es de entretenimiento e información únicamente. No somos operadores de juego. Las apuestas conllevan riesgos; apuesta solo lo que puedas permitirte perder. Ninguna predicción está garantizada. Debes tener 18+ años (21+ en algunos estados de EE.UU.) para participar en apuestas donde sea legal.</p>
  <p><strong>Disclaimer:</strong> This site is for entertainment and informational purposes only. We are not a gambling operator. Gambling involves risk; only bet what you can afford to lose. No prediction is guaranteed. You must be 18+ (21+ in some US states) where gambling is legal.</p>
  <p><strong>Juego responsable:</strong> Si necesitas ayuda, contacta: <a href="tel:18006973735">1-800-MY-RESET (1-800-697-3735)</a> (EE.UU., bilingüe 24/7) | <a href="https://cij.org.mx" rel="noopener">cij.org.mx</a> (México, CONADIC/CIJ)</p>
  <p><strong>Divulgación de afiliados:</strong> Recibimos una comisión si haces clic en ciertos enlaces y te registras, sin costo adicional para ti. Todos los enlaces de afiliados están marcados con rel="sponsored".</p>
</div>
`.trim();

const BANNED_LANGUAGE = [
  'ganador garantizado', '100% seguro', 'gana dinero fácil',
  'pronóstico infalible', 'guaranteed winner', 'sure thing',
  'make money fast', 'ganancia garantizada',
];

const COMMON_SYSTEM_PREAMBLE = `Eres un analista deportivo experimentado con el tono y estilo de los comentaristas de TUDN y TV Azteca. Escribes en español mexicano informal (tuteo), usando terminología futbolística mexicana: "momios" (nunca "cuotas"), "el Tri", "la afición", "el quinto partido", "el área chica", "contención", "cancha", "portero", "medio de contención".

REGLAS DE CONTENIDO:
- Las primeras 1-2 oraciones después de cada H2 DEBEN responder directamente la pregunta del encabezado (estructura "answer-first" para optimización GEO/AEO).
- Incluye un bloque "Puntos Clave" (TL;DR) cerca del inicio con 4-5 datos clave (predicción, resumen de momios, enfrentamiento clave, nota de lesión).
- Usa H2s formulados como pregunta en español (ej: "¿Cuáles son los momios de México vs Alemania?").
- Incluye una tabla comparativa por partido (récord W/L, promedio de goles, estado de jugador clave, H2H reciente).
- NUNCA uses estas frases (contenido prohibido): ${BANNED_LANGUAGE.map(b => `"${b}"`).join(', ')}.
- En vez, usa: "para fines de entretenimiento; los resultados pasados no garantizan resultados futuros."
- Solo referencia jugadores, momios y estadísticas presentes en los datos proporcionados — NO inventes datos.

FORMATO DE SALIDA — responde ÚNICAMENTE con JSON válido:
{
  "h1_title": "string — título H1 optimizado para SEO",
  "meta_description": "string — 150-160 chars, incluye equipo + tipo de contenido",
  "puntos_clave": ["string", "string", "string", "string"],
  "analisis_tactico_html": "string — artículo completo en HTML (mínimo 600 palabras)",
  "pronostico_quiniela": "string — predicción concisa (ej: 'México 2-1')",
  "url_slug": "string — slug SEO-friendly sin acentos"
}`;

const ARTICLE_TYPE_INSTRUCTIONS = {
  pronostico_momios: `
TAREA ESPECÍFICA: Escribe un artículo de pronóstico y momios para el partido.
- Analiza los momios proporcionados y explica el valor de cada línea.
- Incluye análisis táctico de cómo se enfrentarán ambos equipos.
- Da un pronóstico claro con marcador y explicación.
- Menciona momios específicos con el formato "Momios: Local X.XX | Empate X.XX | Visitante X.XX".
- El H1 debe seguir el patrón: "Pronósticos y momios [Equipo A] vs [Equipo B]"`,

  alineacion_probable: `
TAREA ESPECÍFICA: Escribe un artículo de alineación probable para el partido.
- Predice el XI titular de cada equipo basándote en las lesiones y forma proporcionada.
- Explica por qué ciertos jugadores serían titulares o suplentes.
- Incluye análisis de cómo la alineación probable impacta la táctica.
- El H1 debe seguir el patrón: "Alineación probable [Equipo A] vs [Equipo B]"`,

  quiniela_verdict: `
TAREA ESPECÍFICA: Escribe un veredicto de quiniela (¿quién gana?) para el partido.
- Da un veredicto claro: Compra / Espera / Evita para cada equipo en la quiniela.
- Respalda el veredicto con datos concretos del H2H y forma.
- Enfocado en quiniela casual (no apuestas deportivas directas).
- El H1 debe seguir el patrón: "¿Quién gana la quiniela: [A] o [B]?"`,

  analisis_apostar: `
TAREA ESPECÍFICA: Escribe un análisis de apuestas (over/under, tarjetas, props) para el partido.
- Analiza líneas de over/under, props de jugadores, mercados de tarjetas.
- Explica qué apuestas tienen valor basándote en los datos.
- Incluye análisis de tendencias (ej: "México ha tenido over 2.5 en 4 de 5 partidos").
- El H1 debe seguir el patrón: "Análisis para apostar en [Team]"`,
};

/**
 * Builds the system prompt for a given article type.
 * @param {'pronostico_momios'|'alineacion_probable'|'quiniela_verdict'|'analisis_apostar'} articleType
 * @returns {string}
 */
export function buildSystemPrompt(articleType) {
  const typeInstruction = ARTICLE_TYPE_INSTRUCTIONS[articleType] || ARTICLE_TYPE_INSTRUCTIONS.pronostico_momios;
  return `${COMMON_SYSTEM_PREAMBLE}\n${typeInstruction}`;
}

/**
 * Builds the user prompt with match data injected.
 * @param {{ teamA: string, teamB: string, h2h: string, form: string, injuries: string, odds: object, kickoffUtc: string }} data
 * @returns {string}
 */
export function buildUserPrompt(data) {
  const { teamA, teamB, h2h, form, injuries, odds, kickoffUtc } = data;
  return `DATOS DEL PARTIDO:
- Equipos: ${teamA} vs ${teamB}
- Fecha (UTC): ${kickoffUtc}
- Head-to-Head: ${h2h}
- Forma reciente: ${form}
- Lesiones/Bajas: ${injuries || 'Ninguna reportada'}
- Momios: Local ${odds?.home || 'N/A'} | Empate ${odds?.draw || 'N/A'} | Visitante ${odds?.away || 'N/A'}

Genera el artículo siguiendo las instrucciones del sistema. Responde SOLO con el JSON.`;
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/generate/prompt.test.js
```

Expected: 12 tests PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: prompt assembly with MX voice, GEO/AEO structure, disclaimers, per-type variants"
```

---

## Task 9: Cost Report CLI Script

**Files:**
- Create: `scripts/cost-report.js`

**Step 1: Create `scripts/cost-report.js`**

This is a thin CLI wrapper that opens the DB and prints the report. No separate test needed — the logic is tested via `costReport.test.js`; this is just the entry point wired to `npm run cost-report`.

```js
#!/usr/bin/env node
/**
 * CLI: npm run cost-report
 * Prints cost-per-article report from generation_log.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" cost-report spec.
 */

import { openDb, closeDb } from '../src/db/db.js';
import { generateCostReport } from '../src/generate/costReport.js';

const dbPath = process.env.DB_PATH || 'data/wc26.sqlite';

let db;
try {
  db = openDb(dbPath);
} catch (err) {
  console.error(`Failed to open database at ${dbPath}: ${err.message}`);
  console.error('Ensure the DB exists (run the pipeline at least once) or set DB_PATH.');
  process.exit(1);
}

try {
  const report = generateCostReport(db);

  console.log('\n=== WC26 Quiniela — Cost Report ===\n');
  console.log(`Total spend:                 $${report.totalSpend.toFixed(4)}`);
  console.log(`Articles generated:          ${report.articlesGenerated}`);
  console.log(`Cost/article (clean):        $${report.costPerArticle.toFixed(4)}`);
  console.log(`Cost/article (fully loaded): $${report.costPerArticleFullyLoaded.toFixed(4)}`);
  console.log('');

  if (Object.keys(report.modelSplit).length > 0) {
    console.log('--- Model Split ---');
    for (const [model, data] of Object.entries(report.modelSplit)) {
      console.log(`  ${model}: ${data.calls} calls (${data.callPercent.toFixed(1)}%) | $${data.spend.toFixed(4)} (${data.spendPercent.toFixed(1)}%)`);
    }
    console.log('');
  }

  console.log('--- V2 Projection ---');
  console.log(`  Fixtures: ${report.projection.totalFixtures}`);
  console.log(`  Article types: ${report.projection.articleTypesCount}`);
  console.log(`  Passes/article: ${report.projection.passesPerArticle}`);
  console.log(`  Estimated total: $${report.projection.v2TotalEstimate.toFixed(2)}`);
  console.log('');
} finally {
  closeDb(db);
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: cost-report CLI script (npm run cost-report)"
```

---

## Task 10: Full Test Suite Smoke Run

**Step 1: Run the entire test suite**

```bash
npx vitest run
```

Expected: All tests pass (5 config + 4 db + 5 pricing + 12 affiliate + 5 costReport + 13 cadence + 12 prompt = **56 tests PASS**)

**Step 2: Final commit (if any formatting/lint fixes needed)**

```bash
git status
# If clean, no action needed.
# If any files need attention:
git add -A && git commit -m "chore: cleanup after full test suite verification"
```

---

## Summary

| Task | Module | Tests | Key Deliverable |
|------|--------|-------|-----------------|
| 1 | Scaffold | 5 | package.json, config loader, vitest |
| 2 | DB Schema | — | schema.sql with all tables |
| 3 | DB Wrapper | 4 | open, migrate, upsert, generation_log |
| 4 | Pricing | 5 | Token→USD rate table + costOf() |
| 5 | Affiliate Injector | 12 | Regex injection, rel="sponsored" |
| 6 | Cost Report | 5 | Aggregation, model split, projections |
| 7 | Cadence Selector | 13 | T-10/T-2/T-5h state machine |
| 8 | Prompt Assembly | 12 | System/user prompts, disclaimers |
| 9 | Cost Report CLI | — | npm run cost-report entry point |
| 10 | Smoke Run | ALL | Full suite green |

**Total: 56 tests across 10 tasks.**

After this phase completes, the project has a fully-tested, locally-runnable core. Phase 2 (live-service integration) adds: Azure AI router calls, API-Football ingestion, WordPress upsert, Blob persistence, and the GitHub Action workflow — all requiring credentials the user provisions.
