import { memoryDb } from '../../testing/nodeDb';
import { createUserStore, NewScan } from '../store';
import { seedBasicsOnce, BASICS_SEEDED } from '../basics';
import type { KnownCard } from '../../game/types';

const island: KnownCard = { oracleId: 'i', name: 'Island' };
const plains: KnownCard = { oracleId: 'p', name: 'Plains' };
const scan = (o: Partial<NewScan>): NewScan => ({
  at: 't', runId: null, oracleIds: ['a'], name: 'X', source: 'camera', rawText: '', lineUsed: '',
  match: 'exact', priceDate: 'd', minCents: 1000, alert: 'none', readMs: null, ...o,
});

describe('known cards', () => {
  it('marks, lists by name and reports isKnown', () => {
    const s = createUserStore(memoryDb());
    s.markKnown(plains, 't1');
    s.markKnown(island, 't2');
    expect(s.knownCards()).toEqual([{ ...island, markedAt: 't2' }, { ...plains, markedAt: 't1' }]);
    const m = s.knownMarks();
    expect(m.isKnown('i')).toBe(true);
    expect(m.isKnown('zzz')).toBe(false);
  });
  it('keeps the first marked_at when marked again', () => {
    const s = createUserStore(memoryDb());
    s.markKnown(island, 't1');
    s.markKnown(island, 't9');
    expect(s.knownCards()[0].markedAt).toBe('t1');
  });
  it('sets kept versions on and off', () => {
    const s = createUserStore(memoryDb());
    s.markKnown(island, 't');
    s.setKeptVersion('i', 'x:nonfoil', true);
    s.setKeptVersion('i', 'y:foil', true);
    s.setKeptVersion('i', 'x:nonfoil', true);
    expect([...s.knownMarks().kept('i')].sort()).toEqual(['x:nonfoil', 'y:foil']);
    s.setKeptVersion('i', 'x:nonfoil', false);
    expect([...s.knownMarks().kept('i')]).toEqual(['y:foil']);
    expect(s.knownMarks().kept('other').size).toBe(0);
  });
  it('unmark clears kept versions', () => {
    const s = createUserStore(memoryDb());
    s.markKnown(island, 't');
    s.setKeptVersion('i', 'x:nonfoil', true);
    s.unmarkKnown('i');
    expect(s.knownCards()).toEqual([]);
    expect(s.knownMarks().isKnown('i')).toBe(false);
    expect(s.knownMarks().kept('i').size).toBe(0);
  });
  it('knownMarks is a snapshot', () => {
    const s = createUserStore(memoryDb());
    const before = s.knownMarks();
    s.markKnown(island, 't');
    expect(before.isKnown('i')).toBe(false);
    expect(s.knownMarks().isKnown('i')).toBe(true);
  });
  it('scannedCards dedupes, uses the latest name, and skips tokens', () => {
    const s = createUserStore(memoryDb());
    s.recordScan(scan({ at: '1', oracleIds: ['a', 'b'], name: 'Old' }));
    s.recordScan(scan({ at: '2', oracleIds: ['a', 'b'], name: 'New' }));
    s.recordScan(scan({ at: '3', oracleIds: [], name: 'Goblin token' }));
    s.recordScan(scan({ at: '4', oracleIds: ['c'], name: 'Cee' }));
    const out = s.scannedCards().sort((x, y) => x.name.localeCompare(y.name));
    expect(out).toEqual([{ oracleIds: ['c'], name: 'Cee' }, { oracleIds: ['a', 'b'], name: 'New' }]);
  });
});

describe('seedBasicsOnce', () => {
  it('runs once', () => {
    const s = createUserStore(memoryDb());
    const game = { basicLands: () => [island, plains] };
    expect(seedBasicsOnce(s, game, 't')).toBe(2);
    expect(s.getSetting(BASICS_SEEDED)).toBe('1');
    s.unmarkKnown('i');
    expect(seedBasicsOnce(s, game, 't2')).toBe(0);
    expect(s.knownMarks().isKnown('i')).toBe(false);
  });
  it('skips basics already known', () => {
    const s = createUserStore(memoryDb());
    s.markKnown(island, 't0');
    expect(seedBasicsOnce(s, { basicLands: () => [island, plains] }, 't')).toBe(1);
  });
  it('leaves the flag unset when there are no basics', () => {
    const s = createUserStore(memoryDb());
    expect(seedBasicsOnce(s, { basicLands: () => [] }, 't')).toBe(0);
    expect(s.getSetting(BASICS_SEEDED)).toBeNull();
  });
});
