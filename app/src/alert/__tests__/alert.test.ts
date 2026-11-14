import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { normalizeName } from '../../game/mtg/normalize';
import { lookupGroups, resolveExact } from '../../game/mtg/lookup';
import type { SortOrder, CardGroup, Version } from '../../game/types';
import golden from '../../game/mtg/__fixtures__/golden.json';
import {
  NO_MARKS, PRESET_CENTS, RATE_MIN_CARDS, alertFor, alertRates, maxAlertCents, priceLabel,
  type KnownMarks,
} from '../alert';

const ORDER = ['old border', 'Secret Lair', 'serialized'];

function ver(key: string, quietKind = '', priceCents: number | null = 5000): Version {
  return { key, quietKind, priceCents } as Version;
}
function group(oracleId: string, qualifying: Version[], unpriced: Version[] = []): CardGroup {
  return { oracleId, name: oracleId, qualifying, unpriced, totalVersions: qualifying.length + unpriced.length } as unknown as CardGroup;
}
function marks(known: Record<string, string[]>): KnownMarks {
  return {
    isKnown: (id) => id in known,
    kept: (id) => new Set(known[id] ?? []),
  };
}
const old = (k: string) => ver(k, 'old border');
const lair = (k: string) => ver(k, 'Secret Lair');
const ser = (k: string) => ver(k, 'serialized');

describe('alertFor labels', () => {
  test('full, not known', () => {
    expect(alertFor([group('a', [ver('a1')])], 1000, NO_MARKS, ORDER))
      .toEqual({ kind: 'full', known: false, count: 1, quietKinds: [], label: 'Worth finding' });
  });
  test('quiet: one kind', () => {
    const a = alertFor([group('a', [old('1'), old('2'), old('3')])], 1000, NO_MARKS, ORDER);
    expect(a.kind).toBe('quiet');
    expect(a.quietKinds).toEqual(['old border']);
    expect(a.label).toBe('Old border only · 3 versions at $10+');
  });
  test('quiet: two kinds', () => {
    const a = alertFor([group('a', [old('1'), old('2'), lair('3'), lair('4')])], 1000, NO_MARKS, ORDER);
    expect(a.label).toBe('Old border or Secret Lair only · 4 versions at $10+');
  });
  test('quiet: three kinds, in kind order', () => {
    const a = alertFor([group('a', [ser('5'), lair('3'), old('1'), old('2'), lair('4')])], 1000, NO_MARKS, ORDER);
    expect(a.quietKinds).toEqual(['old border', 'Secret Lair', 'serialized']);
    expect(a.label).toBe('Old border, Secret Lair or serialized only · 5 versions at $10+');
  });
  test('quiet: singular', () => {
    const a = alertFor([group('a', [ser('1')])], 1000, NO_MARKS, ORDER);
    expect(a.label).toBe('Serialized only · 1 version at $10+');
  });
  test('none, not known', () => {
    expect(alertFor([group('a', [])], 1000, NO_MARKS, ORDER))
      .toEqual({ kind: 'none', known: false, count: 0, quietKinds: [], label: null });
  });
  test('no groups is none and not known', () => {
    expect(alertFor([], 1000, NO_MARKS, ORDER))
      .toEqual({ kind: 'none', known: false, count: 0, quietKinds: [], label: null });
  });
  test('an unpriced old-border version does not count', () => {
    const a = alertFor([group('a', [], [ver('u', 'old border', null)])], 1000, NO_MARKS, ORDER);
    expect(a.kind).toBe('none');
    expect(a.count).toBe(0);
  });
  test('a full version makes it full even with quiet ones', () => {
    const a = alertFor([group('a', [old('1'), ver('2')])], 1000, NO_MARKS, ORDER);
    expect(a.kind).toBe('full');
    expect(a.count).toBe(2);
    expect(a.quietKinds).toEqual([]);
  });
});

describe('alertFor known cards', () => {
  test('known with no kept versions', () => {
    const a = alertFor([group('a', [ver('a1')])], 1000, marks({ a: [] }), ORDER);
    expect(a).toMatchObject({ kind: 'none', known: true, count: 0, label: 'Known' });
  });
  test('known, kept version below the price', () => {
    // the kept key is not in qualifying (it fell below the price)
    const a = alertFor([group('a', [])], 1000, marks({ a: ['a1'] }), ORDER);
    expect(a).toMatchObject({ kind: 'none', known: true, label: 'Known' });
  });
  test('kept full version', () => {
    const a = alertFor([group('a', [ver('a1'), ver('a2')])], 1000, marks({ a: ['a1'] }), ORDER);
    expect(a).toMatchObject({ kind: 'full', known: true, count: 1, label: 'Known · 1 version still alerts' });
  });
  test('two kept old-border versions', () => {
    const a = alertFor([group('a', [old('1'), old('2'), old('3')])], 1000, marks({ a: ['1', '2'] }), ORDER);
    expect(a).toMatchObject({ kind: 'quiet', known: true, count: 2, quietKinds: ['old border'], label: 'Known · 2 versions still alert' });
  });
  test('two groups, one known and one not', () => {
    const a = alertFor([group('a', [ver('a1')]), group('b', [ver('b1')])], 1000, marks({ a: ['a1'] }), ORDER);
    expect(a.known).toBe(false);
    expect(a.kind).toBe('full');
    expect(a.count).toBe(2);
    expect(a.label).toBe('Worth finding');
  });
  test('all groups known', () => {
    const a = alertFor([group('a', [ver('a1')]), group('b', [ver('b1')])], 1000, marks({ a: ['a1'], b: [] }), ORDER);
    expect(a).toMatchObject({ known: true, count: 1, label: 'Known · 1 version still alerts' });
  });
});

test.each([
  [200, '$2+'], [1000, '$10+'], [750, '$7.50+'], [1999, '$19.99+'], [100000, '$1,000+'],
])('priceLabel(%i)', (cents, label) => expect(priceLabel(cents)).toBe(label));

describe('maxAlertCents', () => {
  test('highest priced normal version', () => {
    const gs = [group('a', [ver('1', '', 3000), old('2'), ver('3', '', 7000)])];
    expect(maxAlertCents(gs, NO_MARKS)).toBe(7000);
  });
  test('ignores quiet kinds and unpriced versions', () => {
    const gs = [group('a', [old('1')], [ver('u', '', null)])];
    expect(maxAlertCents(gs, NO_MARKS)).toBeNull();
  });
  test('uses kept versions for a known card', () => {
    const gs = [group('a', [ver('1', '', 3000), ver('2', '', 7000)])];
    expect(maxAlertCents(gs, marks({ a: ['1'] }))).toBe(3000);
    expect(maxAlertCents(gs, marks({ a: [] }))).toBeNull();
  });
});

describe('alertRates', () => {
  test('constants', () => {
    expect(PRESET_CENTS).toEqual([200, 500, 1000, 2000, 5000]);
    expect(RATE_MIN_CARDS).toBe(50);
  });
  test('null below 50 cards', () => {
    expect(alertRates(Array(49).fill(1500), PRESET_CENTS)).toBeNull();
  });
  test('shares at or above each preset', () => {
    const maxes = [...Array(30).fill(null), ...Array(10).fill(1500), ...Array(10).fill(6000)];
    expect(Object.fromEntries(alertRates(maxes, PRESET_CENTS)!))
      .toEqual({ 200: 0.4, 500: 0.4, 1000: 0.4, 2000: 0.2, 5000: 0.2 });
  });
});

describe('golden parity', () => {
  interface Case { query: string; min_cents: number; order: SortOrder; alert: string; quiet_kinds: string[] }
  const cases = golden.cases as unknown as Case[];
  const db = openNodeDb(path.join(__dirname, '../../game/mtg/__fixtures__/golden.sqlite'));
  afterAll(() => db.close());

  test.each(cases)('$query at $min_cents ($order)', (c) => {
    const resolved = resolveExact(db, normalizeName(c.query));
    const groups = lookupGroups(db, resolved.oracleIds, c.min_cents, c.order);
    const a = alertFor(groups, c.min_cents, NO_MARKS, ORDER);
    expect(a.kind).toBe(c.alert);
    expect(a.quietKinds).toEqual(c.quiet_kinds);
  });
});
