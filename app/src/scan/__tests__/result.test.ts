import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import golden from '../../game/mtg/__fixtures__/golden.json';
import { NO_MARKS, type KnownMarks } from '../../alert/alert';
import type { CardMatch, SortOrder } from '../../game/types';
import { missingVersion, resultModel, scanAlert, type Shown } from '../result';

interface Case { query: string; min_cents: number; order: SortOrder; alert: string }
const cases = golden.cases as unknown as Case[];
const db = openNodeDb(path.join(__dirname, '../../game/mtg/__fixtures__/golden.sqlite'));
afterAll(() => db.close());
const game = createMtgGame(db);

const fireball = game.matchTitle('Fireball') as CardMatch;
const fireballId = fireball.oracleIds[0];
const shown = (match: CardMatch, thisVersion: string | null = null): Shown => ({ match, thisVersion });
function known(oracleId: string, kept: string[]): KnownMarks {
  return { isKnown: (id) => id === oracleId, kept: (id) => new Set(id === oracleId ? kept : []) };
}

test('Fireball at $10+, oldest first, alerts as golden says', () => {
  const c = cases.find((x) => x.query === 'Fireball' && x.min_cents === 1000 && x.order === 'oldest')!;
  const model = resultModel(game, shown(fireball), 1000, 'oldest', NO_MARKS);
  expect(model.groups.map((g) => g.oracleId)).toEqual([fireballId]);
  expect(model.alert.kind).toBe(c.alert);
  expect(scanAlert(model)).toBe(c.alert);
});

test('Fireball marked known with no kept versions is a known scan', () => {
  const model = resultModel(game, shown(fireball), 1000, 'oldest', known(fireballId, []));
  expect(model.alert).toMatchObject({ kind: 'none', known: true, label: 'Known' });
  expect(model.groups[0].qualifying.length).toBeGreaterThan(0); // the full result still shows
  expect(scanAlert(model)).toBe('known');
});

test('Fireball marked known, keeping one qualifying normal version, is a full alert', () => {
  // At $10+ every qualifying Fireball is old border, so the kept normal version is taken at $2+.
  const open = resultModel(game, shown(fireball), 200, 'oldest', NO_MARKS);
  const normal = open.groups[0].qualifying.find((v) => v.quietKind === '')!;
  expect(normal).toBeDefined();
  const model = resultModel(game, shown(fireball), 200, 'oldest', known(fireballId, [normal.key]));
  expect(model.alert).toMatchObject({ kind: 'full', known: true, count: 1 });
  expect(scanAlert(model)).toBe('full');
});

test('a token has no groups and no alert', () => {
  const saproling = game.matchTitle('Saproling') as CardMatch;
  expect(saproling.isToken).toBe(true);
  const model = resultModel(game, shown(saproling), 1000, 'oldest', NO_MARKS);
  expect(model).toEqual({ groups: [], alert: { kind: 'none', known: false, count: 0, quietKinds: [], label: null } });
  expect(scanAlert(model)).toBe('none');
});

test('scanAlert: a known card that still alerts keeps its kind', () => {
  const base = { known: true, count: 1, quietKinds: [], label: 'Known · 1 version still alerts' };
  expect(scanAlert({ groups: [], alert: { ...base, kind: 'full' } })).toBe('full');
  expect(scanAlert({ groups: [], alert: { ...base, kind: 'quiet', quietKinds: ['old border'] } })).toBe('quiet');
  expect(scanAlert({ groups: [], alert: { ...base, kind: 'none', known: false, count: 0, label: null } })).toBe('none');
});

describe('thisVersion', () => {
  const m10 = '1dc84106-aec3-4e52-8dcb-1ed545bf3058'; // Magic 2010 #136, priced under $2 in both finishes
  const lea = 'b7623c00-144b-4a8f-9c6c-f5e9e4f65ece'; // Alpha #149, $101.80

  test('passes through to the caller unchanged and does not change the model', () => {
    const s = shown(fireball, m10);
    const model = resultModel(game, s, 1000, 'oldest', NO_MARKS);
    expect(s.thisVersion).toBe(m10);
    expect(model).toEqual(resultModel(game, shown(fireball), 1000, 'oldest', NO_MARKS));
  });

  test('missingVersion: a typed version below the price is missing, with its set and number', () => {
    const model = resultModel(game, shown(fireball, m10), 1000, 'oldest', NO_MARKS);
    expect(missingVersion(model.groups, m10)).toMatchObject({ scryfallId: m10, setCode: 'm10', collectorNumber: '136' });
  });

  test('missingVersion: none for a version in the list, no typed version, or an unknown one', () => {
    const model = resultModel(game, shown(fireball, lea), 1000, 'oldest', NO_MARKS);
    expect(model.groups[0].qualifying.some((v) => v.scryfallId === lea)).toBe(true);
    expect(missingVersion(model.groups, lea)).toBeNull();
    expect(missingVersion(model.groups, null)).toBeNull();
    expect(missingVersion(model.groups, 'not-an-id')).toBeNull();
    const unpriced = model.groups[0].unpriced[0];
    expect(missingVersion(model.groups, unpriced.scryfallId)).toBeNull();
  });
});
