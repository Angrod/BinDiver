import { memoryDb } from '../../testing/nodeDb';
import { createUserStore, NewScan } from '../store';

const scan = (o: Partial<NewScan> = {}): NewScan => ({
  at: '2026-11-06T10:00:00.000Z', runId: null, oracleIds: ['a', 'b'], name: 'Island',
  source: 'camera', rawText: 'Isl', lineUsed: 'Island', match: 'exact',
  priceDate: '2026-11-04', minCents: 25, alert: 'full', readMs: null, ...o,
});

// The log as version 1 of the app wrote it, before scans had read_ms.
const V1_LOG = `
CREATE TABLE test_runs (id INTEGER PRIMARY KEY, started_at TEXT NOT NULL, stopped_at TEXT,
  stack_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE scans (id INTEGER PRIMARY KEY, at TEXT NOT NULL, run_id INTEGER, oracle_id TEXT NOT NULL,
  name TEXT NOT NULL, source TEXT NOT NULL, raw_text TEXT NOT NULL, line_used TEXT NOT NULL,
  match TEXT NOT NULL, price_date TEXT NOT NULL, min_cents INTEGER NOT NULL, alerted INTEGER NOT NULL,
  marked_wrong INTEGER NOT NULL DEFAULT 0);
INSERT INTO test_runs (id, started_at, stopped_at, stack_count) VALUES (1, 't0', 't1', 54);
INSERT INTO scans (at, run_id, oracle_id, name, source, raw_text, line_used, match, price_date,
  min_cents, alerted) VALUES ('t0', 1, 'a', 'Island', 'camera', 'Isl', 'island', 'exact', 'd', 1000, 0);
PRAGMA user_version = 1;
`;

describe('user store', () => {
  it('round-trips settings', () => {
    const s = createUserStore(memoryDb());
    expect(s.getSetting('x')).toBeNull();
    s.setSetting('x', '1');
    s.setSetting('x', '2');
    expect(s.getSetting('x')).toBe('2');
  });
  it('records scans and restores them', () => {
    const s = createUserStore(memoryDb());
    const run = s.startRun(5, 't0');
    const id = s.recordScan(scan({ runId: run }));
    const [r] = s.runScans(run);
    expect(r).toEqual({ ...scan({ runId: run }), id, markedWrong: false, alerted: true });
    s.setMarkedWrong(id, true);
    expect(s.runScans(run)[0].markedWrong).toBe(true);
    s.setMarkedWrong(id, false);
    expect(s.runScans(run)[0].markedWrong).toBe(false);
  });
  it('orders run scans by at then id', () => {
    const s = createUserStore(memoryDb());
    const run = s.startRun(1, 't0');
    const a = s.recordScan(scan({ runId: run, at: '2026-11-06T10:00:05.000Z' }));
    const b = s.recordScan(scan({ runId: run, at: '2026-11-06T10:00:01.000Z' }));
    const c = s.recordScan(scan({ runId: run, at: '2026-11-06T10:00:01.000Z' }));
    expect(s.runScans(run).map((x) => x.id)).toEqual([b, c, a]);
  });
  it('tracks runs', () => {
    const s = createUserStore(memoryDb());
    expect(s.currentRun()).toBeNull();
    expect(s.latestRun()).toBeNull();
    const id = s.startRun(50, 't1');
    expect(s.currentRun()).toEqual({ id, startedAt: 't1', stoppedAt: null, stackCount: 50 });
    s.setStackCount(id, 60);
    expect(s.currentRun()?.stackCount).toBe(60);
    s.stopRun(id, 't2');
    expect(s.currentRun()).toBeNull();
    expect(s.latestRun()?.stoppedAt).toBe('t2');
  });
  it('keeps data when created twice on one database', () => {
    const db = memoryDb();
    createUserStore(db).setSetting('k', 'v');
    expect(createUserStore(db).getSetting('k')).toBe('v');
  });
});

describe('read times', () => {
  it('keeps how long a camera read took', () => {
    const s = createUserStore(memoryDb());
    const run = s.startRun(1, 't0');
    s.recordScan(scan({ runId: run, readMs: 1234 }));
    expect(s.runScans(run)[0].readMs).toBe(1234);
  });
  it('upgrades a version 1 log, keeping its scans, and opens it again', () => {
    const db = memoryDb();
    db.exec(V1_LOG);
    const s = createUserStore(db);
    expect(s.runScans(1)).toEqual([expect.objectContaining({ name: 'Island', readMs: null, alert: '' })]);
    s.recordScan(scan({ runId: 1, at: 't2', readMs: 800 }));
    expect(createUserStore(db).runScans(1).map((x) => x.readMs)).toEqual([null, 800]);
  });
  it('opens a log that an older build put back to version 1 after the upgrade', () => {
    const db = memoryDb();
    createUserStore(db).recordScan(scan({ readMs: 500 }));
    db.exec('PRAGMA user_version = 1'); // what the first build's schema did on every launch
    expect(() => createUserStore(db)).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
  });
});

describe('scan alerts', () => {
  it('stores alert and alerted', () => {
    const s = createUserStore(memoryDb());
    const run = s.startRun(1, 't0');
    for (const alert of ['full', 'quiet', 'known', 'none'] as const) s.recordScan(scan({ runId: run, alert }));
    expect(s.runScans(run).map((x) => [x.alert, x.alerted])).toEqual([
      ['full', true], ['quiet', false], ['known', false], ['none', false],
    ]);
  });
  it('runs migration 3 on a version 2 log, and again on one already holding alert', () => {
    const db = memoryDb();
    db.exec(V1_LOG);
    db.exec('ALTER TABLE scans ADD COLUMN read_ms INTEGER; PRAGMA user_version = 2');
    createUserStore(db);
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
    db.exec('PRAGMA user_version = 2');
    expect(() => createUserStore(db)).not.toThrow();
    expect(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(3);
    expect(createUserStore(db).runScans(1)[0].alert).toBe('');
  });
});
