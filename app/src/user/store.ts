import type { Db } from '../db/types';
import { MIGRATIONS, USER_SCHEMA, USER_VERSION } from './schema';

export interface NewScan {
  at: string; runId: number | null; oracleIds: string[]; name: string;
  source: 'camera' | 'search'; rawText: string; lineUsed: string;
  match: 'exact' | 'tolerant' | 'typed'; priceDate: string; minCents: number; alerted: boolean;
  /** Camera reads: ms from the card's first new read to its commit; null when unknown or typed. */
  readMs: number | null;
}
export interface Scan extends NewScan { id: number; markedWrong: boolean }
export interface TestRun { id: number; startedAt: string; stoppedAt: string | null; stackCount: number }
export interface UserStore {
  getSetting(key: string): string | null; setSetting(key: string, value: string): void;
  recordScan(s: NewScan): number; setMarkedWrong(scanId: number, wrong: boolean): void;
  startRun(stackCount: number, at: string): number; stopRun(runId: number, at: string): void;
  setStackCount(runId: number, n: number): void;
  currentRun(): TestRun | null;
  latestRun(): TestRun | null;
  runScans(runId: number): Scan[];
}

interface RunRow { id: number; started_at: string; stopped_at: string | null; stack_count: number }
interface ScanRow {
  id: number; at: string; run_id: number | null; oracle_id: string; name: string;
  source: 'camera' | 'search'; raw_text: string; line_used: string;
  match: 'exact' | 'tolerant' | 'typed'; price_date: string; min_cents: number;
  alerted: number; marked_wrong: number; read_ms: number | null;
}

const toRun = (r: RunRow | null): TestRun | null =>
  r && { id: r.id, startedAt: r.started_at, stoppedAt: r.stopped_at, stackCount: r.stack_count };

/** Creates the log if it is new, then upgrades it one version at a time, each step in a transaction. */
function openLog(db: Db): void {
  db.exec(USER_SCHEMA);
  const found = db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  for (let v = Math.max(found, 1); v < USER_VERSION; v++) {
    db.exec(`BEGIN; ${MIGRATIONS[v - 1]} PRAGMA user_version = ${v + 1}; COMMIT;`);
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
           price_date, min_cents, alerted, marked_wrong, read_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [s.at, s.runId, s.oracleIds.join(','), s.name, s.source, s.rawText, s.lineUsed,
          s.match, s.priceDate, s.minCents, s.alerted ? 1 : 0, s.readMs],
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
        alerted: r.alerted === 1, markedWrong: r.marked_wrong === 1, readMs: r.read_ms,
      })),
  };
}
