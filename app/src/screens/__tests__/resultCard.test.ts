import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import { NO_MARKS, type KnownMarks } from '../../alert/alert';
import type { CardMatch } from '../../game/types';
import { resultModel, type Shown } from '../../scan/result';
import { resultCardLines } from '../resultCard';

const db = openNodeDb(path.join(__dirname, '../../game/mtg/__fixtures__/golden.sqlite'));
afterAll(() => db.close());
const game = createMtgGame(db);

const TEN = 1000;
const read = (title: string) => game.matchTitle(title) as CardMatch;
function lines(match: CardMatch, opts: { thisVersion?: string | null; marks?: KnownMarks; minCents?: number } = {}) {
  const shown: Shown = { match, thisVersion: opts.thisVersion ?? null };
  const minCents = opts.minCents ?? TEN;
  return resultCardLines(resultModel(game, shown, minCents, 'oldest', opts.marks ?? NO_MARKS), shown, minCents);
}

// Counts and labels are the golden fixture's (golden.json, built by the Python side) at $10+, oldest first.
describe('resultCardLines', () => {
  test('Counterspell: a full alert, with its count over every version', () => {
    expect(lines(read('Counterspell'))).toEqual({
      label: 'Worth finding', name: 'Counterspell', count: '36 of 106 versions at $10+', notes: [],
    });
  });

  test('Juzám Djinn: a quiet alert shows the quiet label', () => {
    expect(lines(read('Juzám Djinn'))).toEqual({
      label: 'Old border only · 1 version at $10+', name: 'Juzám Djinn', count: '1 of 2 versions at $10+', notes: [],
    });
  });

  test('Bloodfell Caves: nothing at the price says so, with no label', () => {
    expect(lines(read('Bloodfell Caves'))).toEqual({
      label: null, name: 'Bloodfell Caves', count: 'Nothing at $10+', notes: [],
    });
  });

  test('Island, known: the Known label over the still-counted versions', () => {
    const island = read('Island');
    const marks: KnownMarks = { isKnown: (id) => island.oracleIds.includes(id), kept: () => new Set() };
    expect(lines(island, { marks })).toEqual({
      label: 'Known', name: 'Island', count: '67 of 1193 versions at $10+', notes: [],
    });
  });

  test('a Saproling token shows its name and that tokens are not tracked', () => {
    // A token's match carries the normalized name, as the panel shows it.
    expect(lines(read('Saproling'))).toEqual({
      label: null, name: 'saproling', count: 'Token, not tracked', notes: [],
    });
  });

  test('a tolerant read of a token adds the read-as line too', () => {
    const token = { ...read('Saproling'), match: 'tolerant' as const, lineUsed: 'saprolinq' };
    expect(lines(token)).toEqual({
      label: null, name: 'saproling', count: 'Token, not tracked',
      notes: ['Read as “saprolinq”. Not this card? Tap Search.'],
    });
  });

  test('a tolerant read adds the read-as line', () => {
    // lineUsed is the normalized line read, as the panel shows it.
    expect(lines(read('Bloodfell Caues'))).toEqual({
      label: null, name: 'Bloodfell Caves', count: 'Nothing at $10+',
      notes: ['Read as “bloodfell caues”. Not this card? Tap Search.'],
    });
  });

  test("a typed version that isn't at the price adds the This version line", () => {
    const hit = game.findPrinting('M10 136')!; // Fireball, Magic 2010 #136, under $2 in both finishes
    expect(hit.printing).toMatchObject({ name: 'Fireball', setCode: 'm10', collectorNumber: '136' });
    expect(lines(hit.match, { thisVersion: hit.printing.scryfallId })).toEqual({
      label: 'Old border only · 4 versions at $10+', name: 'Fireball', count: '4 of 49 versions at $10+',
      notes: ["This version (M10 #136) isn't at $10+."],
    });
  });

  test('a typed version that is in the list adds no line', () => {
    const hit = game.findPrinting('LEA 149')!; // Fireball, Alpha #149, $101.80
    expect(lines(hit.match, { thisVersion: hit.printing.scryfallId }).notes).toEqual([]);
  });

  test('a name with two cards counts both of them', () => {
    // B.F.M. is two cards (left and right halves), one version each, both at $10+.
    expect(lines(read('B.F.M. (Big Furry Monster)'))).toMatchObject({ count: '2 of 2 versions at $10+' });
  });

  test('follows the price: Counterspell at $50+', () => {
    expect(lines(read('Counterspell'), { minCents: 5000 }).count).toBe('13 of 106 versions at $50+');
  });
});
