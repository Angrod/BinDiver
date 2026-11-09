export const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS known_cards (
  oracle_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  marked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS known_kept_versions (
  oracle_id TEXT NOT NULL,
  version_key TEXT NOT NULL,
  PRIMARY KEY (oracle_id, version_key)
);
CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  stack_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  run_id INTEGER,
  oracle_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  line_used TEXT NOT NULL,
  match TEXT NOT NULL,
  price_date TEXT NOT NULL,
  min_cents INTEGER NOT NULL,
  alerted INTEGER NOT NULL,
  marked_wrong INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS scans_run_idx ON scans (run_id, at, id);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** The log's version, kept in SQLite's user_version. USER_SCHEMA creates version 1. */
export const USER_VERSION = 2;

/** MIGRATIONS[n - 1] takes the log from version n to n + 1. */
export const MIGRATIONS: string[] = [
  // 2: how long each camera read took, from the card's first new read to its commit.
  'ALTER TABLE scans ADD COLUMN read_ms INTEGER;',
];
