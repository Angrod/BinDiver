import path from 'node:path';
import { openNodeDb } from '../../../testing/nodeDb';
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
