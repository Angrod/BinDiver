import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import { searchList } from '../searchList';

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

  test('number/total: candidates, narrowed by artist', () => {
    const all = searchList(game, '61/350', null);
    expect(all.every((i) => i.kind === 'candidate')).toBe(true);
    expect(all.some((i) => i.kind === 'candidate' && i.printing.name === 'Counterspell')).toBe(true);
    const cands = game.numberCandidates('61/350');
    const hk = game.artistOptions(cands, 'hann', 5)[0];
    const narrowed = searchList(game, '61/350', hk.id);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]).toMatchObject({ kind: 'candidate', printing: { name: 'Counterspell' } });
  });

  test('a name prefix', () => {
    const n = names(searchList(game, 'fireb', null));
    expect(n.length).toBeGreaterThan(0);
    expect(n.every((x) => x.toLowerCase().startsWith('fireb'))).toBe(true);
  });

  test('empty text gives nothing', () => {
    expect(searchList(game, '  ', null)).toEqual([]);
  });
});
