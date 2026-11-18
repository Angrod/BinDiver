import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import { searchList, searchNote } from '../searchList';

const db = openNodeDb(path.join(__dirname, '../../game/mtg/__fixtures__/golden.sqlite'));
afterAll(() => db.close());
const game = createMtgGame(db);

const names = (items: ReturnType<typeof searchList>) =>
  items.flatMap((i) => (i.kind === 'name' ? [i.name] : []));

describe('searchList', () => {
  test('set and number: the printing first, then names', () => {
    const items = searchList(game, '2XM 44', null);
    expect(items[0]).toMatchObject({ kind: 'printing', hit: { match: { name: 'Brainstorm' } } });
  });

  test('Fire 2 is a name: names only, as suggest gives them', () => {
    const items = searchList(game, 'Fire 2', null);
    expect(items.some((i) => i.kind === 'printing')).toBe(false);
    expect(names(items)).toEqual(game.suggest('Fire 2', 6));
  });

  const hk = game.artistOptions('hann', 5)[0];

  test('number/total: candidates, narrowed by artist', () => {
    const all = searchList(game, '61/350', null);
    expect(all.every((i) => i.kind === 'candidate')).toBe(true);
    expect(all.some((i) => i.kind === 'candidate' && i.printing.name === 'Counterspell')).toBe(true);
    const narrowed = searchList(game, '61/350', hk.id);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]).toMatchObject({ kind: 'candidate', printing: { name: 'Counterspell' } });
  });

  test('a bare number: candidates, narrowed by artist', () => {
    const all = searchList(game, '61', null);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((i) => i.kind === 'candidate')).toBe(true);
    const narrowed = searchList(game, '61', hk.id);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]).toMatchObject({ kind: 'candidate', printing: { name: 'Counterspell', setCode: '6ed' } });
  });

  test('the artist alone: their cards by name', () => {
    const items = searchList(game, '', hk.id);
    expect(items).toEqual(game.artistCards(hk.id).map((name) => ({ kind: 'name', name })));
    expect(items.length).toBeGreaterThan(0);
  });

  test('a name search ignores the artist', () => {
    expect(searchList(game, 'fireb', hk.id)).toEqual(searchList(game, 'fireb', null));
  });

  test('a name prefix', () => {
    const n = names(searchList(game, 'fireb', null));
    expect(n.length).toBeGreaterThan(0);
    expect(n.every((x) => x.toLowerCase().startsWith('fireb'))).toBe(true);
  });

  test('empty text and no artist gives nothing', () => {
    expect(searchList(game, '  ', null)).toEqual([]);
  });
});

describe('searchNote', () => {
  test('a number with nothing found', () => {
    expect(searchNote('number', '420', 0, false)).toBe('No card with that number.');
    expect(searchNote('number-total', '38/143', 0, true)).toBe('No card with that number by that artist.');
  });
  test('a full list of candidates without an artist asks for one', () => {
    expect(searchNote('number', '44', 50, false)).toBe('Showing the first 50. Add the artist to narrow.');
    expect(searchNote('number', '44', 50, true)).toBeNull();
    expect(searchNote('number', '44', 49, false)).toBeNull();
  });
  test('the artist alone with no cards', () => {
    expect(searchNote('name', '', 0, true)).toBe('No cards by that artist.');
    expect(searchNote('name', '', 3, true)).toBeNull();
  });
  test('nothing for names, set and number, or an empty box', () => {
    expect(searchNote('name', 'fireb', 0, true)).toBeNull();
    expect(searchNote('set-number', '2XM 44', 0, false)).toBeNull();
    expect(searchNote('name', '  ', 0, false)).toBeNull();
  });
});
