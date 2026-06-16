import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.cwd();
const defaultDbPath = path.join(rootDir, 'marketing.sqlite');
const configuredDbPath = process.env.MARKETING_DB_PATH || defaultDbPath;
const dbPath = path.isAbsolute(configuredDbPath)
  ? configuredDbPath
  : path.resolve(rootDir, configuredDbPath);

let db;

export function getDb() {
  if (!db) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function runMigrations(database = getDb()) {
  const schemaPath = path.resolve(__dirname, '..', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  database.exec(schema);
  // Lightweight migrations for older DBs that predate columns introduced later.
  const cardCols = database.prepare("PRAGMA table_info('cards')").all().map((row) => row.name);
  if (!cardCols.includes('expires_at')) {
    database.exec('ALTER TABLE cards ADD COLUMN expires_at TIMESTAMP');
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_cards_expires_at ON cards(expires_at)');
  return { schemaVersion: 2, dbPath, schemaPath };
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export { dbPath };
