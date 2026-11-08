import { memoryDb } from '../../testing/nodeDb';
import { createUserStore, NewScan } from '../store';

const scan = (o: Partial<NewScan> = {}): NewScan => ({
  at: '2026-11-06T10:00:00.000Z', runId: null, oracleIds: ['a', 'b'], name: 'Island',
  source: 'camera', rawText: 'Isl', lineUsed: 'Island', match: 'exact',
  priceDate: '2026-11-04', minCents: 25, alerted: true, ...o,
});

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
    expect(r).toEqual({ ...scan({ runId: run }), id, markedWrong: false });
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
