import path from 'node:path';
import { openNodeDb } from '../../../testing/nodeDb';
import { oldFormatCopy } from '../../../testing/oldFormat';
import { createMtgGame } from '../index';
import type { SortOrder } from '../types';
import golden from '../__fixtures__/golden.json';

interface Case {
  query: string; min_cents: number; order: SortOrder; match: string;
  groups: { oracle_id: string; qualifying: string[] }[];
}
const cases = golden.cases as Case[];
const db = openNodeDb(path.join(__dirname, '../__fixtures__/golden.sqlite'));
afterAll(() => db.close());
const game = createMtgGame(db);
const fireball = cases.find((c) => c.query === 'Fireball' && c.min_cents === 1000 && c.order === 'oldest' && c.groups.length)
  ?? cases.find((c) => c.query === 'Fireball' && c.groups.length)!;
const fireballIds = [fireball.groups[0].oracle_id];

test('matchTitle exact', () => {
  expect(game.matchTitle('Fireball XR')).toMatchObject({
    name: 'Fireball', match: 'exact', isToken: false, oracleIds: fireballIds,
  });
});
test('matchTitle tolerant', () => {
  expect(game.matchTitle('Bloodfell Caues')).toMatchObject({ name: 'Bloodfell Caves', match: 'tolerant' });
});
test('matchTitle face name resolves to its card', () => {
  expect(game.matchTitle('Insectile Aberration')!.name).toBe('Delver of Secrets // Insectile Aberration');
});
test('matchTitle token', () => {
  expect(game.matchTitle('Saproling')).toMatchObject({ isToken: true, oracleIds: [] });
});
test('matchTitle no match', () => expect(game.matchTitle('xkcd qwerty')).toBeNull());
test('matchTitleLoose takes a read matchTitle misses', () => {
  expect(game.matchTitle('Cqunterspeii')).toBeNull();
  expect(game.matchTitleLoose('Cqunterspeii')).toMatchObject({ name: 'Counterspell', match: 'loose' });
});
test('isFooterText spots the copyright line', () => {
  expect(game.isFooterText('™ & © 2026 Wizards of the Coast')).toBe(true);
  expect(game.isFooterText('Fireball')).toBe(false);
});
test('find', () => {
  expect(game.find('fire // ice')).toMatchObject({ name: 'Fire // Ice', match: 'typed' });
  expect(game.find('Shu Jing Meteorite')).toBeNull();
});
test('suggest', () => {
  expect(game.suggest('fire', 6)).toEqual(['Fire // Ice', 'Fireball']);
  expect(game.suggest('Flreball', 6)).toEqual(['Fireball']);
  expect(game.suggest('Shu Jing Meteorite', 6)).toEqual([]);
});
test('lookup', () => {
  const c = cases.find((x) => x.query === 'Fireball' && x.min_cents === 1000 && x.order === 'oldest' && x.groups.length);
  const keys = game.lookup(fireballIds, 1000, 'oldest')[0].qualifying.map((v) => v.key);
  expect(keys).toEqual((c ?? fireball).groups[0].qualifying);
});
test('setIcon', () => {
  const row = db.get<{ code: string }>('SELECT code FROM sets WHERE icon_svg IS NOT NULL LIMIT 1')!;
  expect(game.setIcon(row.code)).toContain('<svg');
  expect(game.setIcon('none')).toBeNull();
});

test('quietKinds are the three labels in order', () => {
  expect(game.quietKinds).toEqual(['old border', 'Secret Lair', 'serialized']);
});
test('numberSearch is on for the golden data', () => expect(game.numberSearch).toBe(true));
test('explore at 1000 cents carries each version\'s quiet kind', () => {
  const ids = db.all<{ oracle_id: string }>(
    `SELECT DISTINCT p.oracle_id FROM printings p JOIN versions v ON v.printing_id = p.id
     WHERE v.quiet_kind = 'Secret Lair' AND v.price_cents >= 1000`,
  ).map((r) => r.oracle_id);
  expect(ids.length).toBeGreaterThan(0);
  const quals = game.lookup(ids, 1000, 'oldest').flatMap((g) => g.qualifying);
  const secretLair = quals.filter((v) => v.quietKind === 'Secret Lair');
  expect(secretLair.length).toBeGreaterThan(0);
  for (const v of quals) {
    const row = db.get<{ quiet_kind: string }>(
      'SELECT quiet_kind FROM versions WHERE printing_id = ? AND finish = ?', [v.scryfallId, v.finish])!;
    expect(v.quietKind).toBe(row.quiet_kind);
  }
});
test('basicLands on golden is Island alone', () => {
  const lands = game.basicLands();
  expect(lands.map((l) => l.name)).toEqual(['Island']);
  expect(lands[0].oracleId).toMatch(/\S/);
});
describe('old-format database', () => {
  const old = oldFormatCopy(path.join(__dirname, '../__fixtures__/golden.sqlite'));
  afterAll(() => old.close());
  const oldGame = createMtgGame(old);
  test('still matches and looks up, with no quiet kinds', () => {
    const m = oldGame.matchTitle('Fireball');
    expect(m).toMatchObject({ name: 'Fireball' });
    const groups = oldGame.lookup(m!.oracleIds, 0, 'oldest');
    const versions = groups.flatMap((g) => [...g.qualifying, ...g.unpriced]);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((v) => v.quietKind === '')).toBe(true);
  });
  test('numberSearch is off', () => expect(oldGame.numberSearch).toBe(false));
});
