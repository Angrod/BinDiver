import type { Db } from '../db/types';
import type { KnownMarks } from '../alert/alert';
import type { KnownCard } from '../game/types';
import { USER_SCHEMA, USER_VERSION } from './schema';

export interface NewScan {
  at: string; runId: number | null; oracleIds: string[]; name: string;
  source: 'camera' | 'search'; rawText: string; lineUsed: string;
  match: 'exact' | 'tolerant' | 'loose' | 'typed'; priceDate: string; minCents: number;
  /** What the scan's alert was; stored with `alerted` set only for 'full'. */
  alert: 'full' | 'quiet' | 'known' | 'none';
  /** Camera reads: ms from the card's first new read to its commit; null when unknown or typed. */
  readMs: number | null;
}
/** `alert` is '' for a scan from before migration 3. */
export interface Scan extends Omit<NewScan, 'alert'> {
  id: number; markedWrong: boolean; alerted: boolean; alert: NewScan['alert'] | '';
}
export interface TestRun { id: number; startedAt: string; stoppedAt: string | null; stackCount: number }
export interface UserStore {
  getSetting(key: string): string | null; setSetting(key: string, value: string): void;
  recordScan(s: NewScan): number; setMarkedWrong(scanId: number, wrong: boolean): void;
  startRun(stackCount: number, at: string): number; stopRun(runId: number, at: string): void;
  setStackCount(runId: number, n: number): void;
  currentRun(): TestRun | null;
  latestRun(): TestRun | null;
  runScans(runId: number): Scan[];
  /** Marking a card already known keeps its first marked_at. */
  markKnown(card: KnownCard, at: string): void;
  /** Also removes the card's kept versions. */
  unmarkKnown(oracleId: string): void;
  knownCards(): Array<KnownCard & { markedAt: string }>;
  /** A snapshot: later changes do not show in it. */
  knownMarks(): KnownMarks;
  setKeptVersion(oracleId: string, versionKey: string, kept: boolean): void;
  /** One entry per distinct non-empty oracle_id value, named from its most recent scan. */
  scannedCards(): Array<{ oracleIds: string[]; name: string }>;
}

interface RunRow { id: number; started_at: string; stopped_at: string | null; stack_count: number }
interface ScanRow {
  id: number; at: string; run_id: number | null; oracle_id: string; name: string;
  source: 'camera' | 'search'; raw_text: string; line_used: string;
  match: 'exact' | 'tolerant' | 'loose' | 'typed'; price_date: string; min_cents: number;
  alerted: number; marked_wrong: number; read_ms: number | null; alert: NewScan['alert'] | '';
}

const toRun = (r: RunRow | null): TestRun | null =>
  r && { id: r.id, startedAt: r.started_at, stoppedAt: r.stopped_at, stackCount: r.stack_count };

const hasColumn = (db: Db, table: string, column: string): boolean =>
  db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);

/**
 * MIGRATIONS[n - 1] takes the log from version n to n + 1. Each must be safe to run again: the first
 * build resets user_version to 1 on launch, and expo-updates falls back to that build's code if an
 * update crashes, so a log can come back to version 1 with its later columns already there.
 */
const MIGRATIONS: Array<(db: Db) => void> = [
  // 2: how long each camera read took, from the card's first new read to its commit.
  (db) => {
    if (!hasColumn(db, 'scans', 'read_ms')) db.exec('ALTER TABLE scans ADD COLUMN read_ms INTEGER');
  },
  // 3: what each scan's alert was ('' for scans from before).
  (db) => {
    if (!hasColumn(db, 'scans', 'alert')) db.exec("ALTER TABLE scans ADD COLUMN alert TEXT NOT NULL DEFAULT ''");
  },
];

/** Creates the log if it is new, then upgrades it one version at a time, each step in a transaction. */
function openLog(db: Db): void {
  db.exec(USER_SCHEMA);
  const found = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = Math.max(found, 1); v < USER_VERSION; v++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[v - 1](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

export function createUserStore(db: Db): UserStore {
  openLog(db);
  return {
    getSetting: (key) =>
      db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null,
    setSetting: (key, value) => {
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    },
    recordScan: (s) =>
      db.run(
        `INSERT INTO scans (at, run_id, oracle_id, name, source, raw_text, line_used, match,
           price_date, min_cents, alerted, alert, marked_wrong, read_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [s.at, s.runId, s.oracleIds.join(','), s.name, s.source, s.rawText, s.lineUsed,
          s.match, s.priceDate, s.minCents, s.alert === 'full' ? 1 : 0, s.alert, s.readMs],
      ).lastInsertRowId,
    setMarkedWrong: (id, wrong) => {
      db.run('UPDATE scans SET marked_wrong = ? WHERE id = ?', [wrong ? 1 : 0, id]);
    },
    startRun: (stackCount, at) =>
      db.run('INSERT INTO test_runs (started_at, stopped_at, stack_count) VALUES (?, NULL, ?)',
        [at, stackCount]).lastInsertRowId,
    stopRun: (id, at) => {
      db.run('UPDATE test_runs SET stopped_at = ? WHERE id = ?', [at, id]);
    },
    setStackCount: (id, n) => {
      db.run('UPDATE test_runs SET stack_count = ? WHERE id = ?', [n, id]);
    },
    currentRun: () =>
      toRun(db.get<RunRow>('SELECT * FROM test_runs WHERE stopped_at IS NULL ORDER BY id DESC LIMIT 1')),
    latestRun: () => toRun(db.get<RunRow>('SELECT * FROM test_runs ORDER BY id DESC LIMIT 1')),
    runScans: (runId) =>
      db.all<ScanRow>('SELECT * FROM scans WHERE run_id = ? ORDER BY at, id', [runId]).map((r) => ({
        id: r.id, at: r.at, runId: r.run_id,
        oracleIds: r.oracle_id === '' ? [] : r.oracle_id.split(','),
        name: r.name, source: r.source, rawText: r.raw_text, lineUsed: r.line_used,
        match: r.match, priceDate: r.price_date, minCents: r.min_cents,
        alerted: r.alerted === 1, alert: r.alert, markedWrong: r.marked_wrong === 1, readMs: r.read_ms,
      })),
    markKnown: (card, at) => {
      db.run('INSERT OR IGNORE INTO known_cards (oracle_id, name, marked_at) VALUES (?, ?, ?)',
        [card.oracleId, card.name, at]);
    },
    unmarkKnown: (oracleId) => {
      db.exec('BEGIN');
      try {
        db.run('DELETE FROM known_kept_versions WHERE oracle_id = ?', [oracleId]);
        db.run('DELETE FROM known_cards WHERE oracle_id = ?', [oracleId]);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    knownCards: () =>
      db.all<{ oracle_id: string; name: string; marked_at: string }>(
        'SELECT oracle_id, name, marked_at FROM known_cards ORDER BY name COLLATE NOCASE, oracle_id',
      ).map((r) => ({ oracleId: r.oracle_id, name: r.name, markedAt: r.marked_at })),
    knownMarks: () => {
      const known = new Set(db.all<{ oracle_id: string }>('SELECT oracle_id FROM known_cards').map((r) => r.oracle_id));
      const keptBy = new Map<string, Set<string>>();
      for (const r of db.all<{ oracle_id: string; version_key: string }>(
        'SELECT oracle_id, version_key FROM known_kept_versions')) {
        (keptBy.get(r.oracle_id) ?? keptBy.set(r.oracle_id, new Set()).get(r.oracle_id)!).add(r.version_key);
      }
      const none: ReadonlySet<string> = new Set();
      return { isKnown: (id) => known.has(id), kept: (id) => keptBy.get(id) ?? none };
    },
    setKeptVersion: (oracleId, versionKey, kept) => {
      if (kept) {
        db.run('INSERT OR IGNORE INTO known_kept_versions (oracle_id, version_key) VALUES (?, ?)',
          [oracleId, versionKey]);
      } else {
        db.run('DELETE FROM known_kept_versions WHERE oracle_id = ? AND version_key = ?', [oracleId, versionKey]);
      }
    },
    scannedCards: () =>
      db.all<{ oracle_id: string; name: string }>(
        `SELECT oracle_id, name FROM scans s WHERE oracle_id <> ''
           AND id = (SELECT id FROM scans WHERE oracle_id = s.oracle_id ORDER BY at DESC, id DESC LIMIT 1)`,
      ).map((r) => ({ oracleIds: r.oracle_id.split(','), name: r.name })),
  };
}
