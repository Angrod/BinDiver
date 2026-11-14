import path from 'node:path';
import { openNodeDb } from '../../testing/nodeDb';
import { createMtgGame } from '../../game/mtg';
import { NO_MARKS, type KnownMarks } from '../../alert/alert';
import type { CardMatch } from '../../game/types';
import { resultModel, type Shown } from '../../scan/result';
import { hintLines, noteLines, resultCardLines, valueHint } from '../resultCard';

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
      label: 'Worth finding', name: 'Counterspell', count: '36 of 106 versions at $10+', hint: expect.any(String), notes: [],
    });
  });

  test('Juzám Djinn: a quiet alert shows the quiet label', () => {
    expect(lines(read('Juzám Djinn'))).toEqual({
      label: 'Old border only · 1 version at $10+', name: 'Juzám Djinn', count: '1 of 2 versions at $10+', hint: expect.any(String), notes: [],
    });
  });

  test('Bloodfell Caves: nothing at the price says so, with no label', () => {
    expect(lines(read('Bloodfell Caves'))).toEqual({
      label: null, name: 'Bloodfell Caves', count: 'Nothing at $10+', hint: null, notes: [],
    });
  });

  test('Island, known: the Known label over the still-counted versions', () => {
    const island = read('Island');
    const marks: KnownMarks = { isKnown: (id) => island.oracleIds.includes(id), kept: () => new Set() };
    expect(lines(island, { marks })).toEqual({
      label: 'Known', name: 'Island', count: '67 of 1193 versions at $10+', hint: null, notes: [],
    });
  });

  test('a Saproling token shows its name and that tokens are not tracked', () => {
    // A token's match carries the normalized name, as the panel shows it.
    expect(lines(read('Saproling'))).toEqual({
      label: null, name: 'saproling', count: 'Token, not tracked', hint: null, notes: [],
    });
  });

  test('a tolerant read of a token adds the read-as line too', () => {
    const token = { ...read('Saproling'), match: 'tolerant' as const, lineUsed: 'saprolinq' };
    expect(lines(token)).toEqual({
      label: null, name: 'saproling', count: 'Token, not tracked',
      hint: null, notes: ['Read as “saprolinq”. Not this card? Tap Search.'],
    });
  });

  test('a tolerant read adds the read-as line', () => {
    // lineUsed is the normalized line read, as the panel shows it.
    expect(lines(read('Bloodfell Caues'))).toEqual({
      label: null, name: 'Bloodfell Caves', count: 'Nothing at $10+',
      hint: null, notes: ['Read as “bloodfell caues”. Not this card? Tap Search.'],
    });
  });

  test("a typed version that isn't at the price adds the This version line", () => {
    const hit = game.findPrinting('M10 136')!; // Fireball, Magic 2010 #136, under $2 in both finishes
    expect(hit.printing).toMatchObject({ name: 'Fireball', setCode: 'm10', collectorNumber: '136' });
    expect(lines(hit.match, { thisVersion: hit.printing.scryfallId })).toEqual({
      label: 'Old border only · 4 versions at $10+', name: 'Fireball', count: '4 of 49 versions at $10+',
      hint: expect.any(String), notes: ["This version (M10 #136) isn't at $10+."],
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

// The card sits under the outline and may reach the bottom safe area; when its notes won't fit there they
// are cut to fewer lines (never hidden), so the card never has to grow up over the outline.
describe('noteLines', () => {
  const LINE = 18;
  const GAP = 3;
  test('gives a note its two lines when they fit', () => {
    expect(noteLines(200, 1, LINE, GAP)).toBe(2);
    expect(noteLines(39, 1, LINE, GAP)).toBe(2); // 3 + 2 x 18
  });
  test('cuts a note to one line when two would not fit', () => {
    expect(noteLines(38.9, 1, LINE, GAP)).toBe(1);
    expect(noteLines(21, 1, LINE, GAP)).toBe(1);
  });
  test('keeps one line even with no room left', () => {
    expect(noteLines(0, 1, LINE, GAP)).toBe(1);
    expect(noteLines(-40, 1, LINE, GAP)).toBe(1);
  });
  test('shares the room between two notes', () => {
    expect(noteLines(78, 2, LINE, GAP)).toBe(2);
    expect(noteLines(77, 2, LINE, GAP)).toBe(1);
  });
  test('counts the line height it is given, as scaled by a larger text size', () => {
    expect(noteLines(39, 1, 27, GAP)).toBe(1);
  });
});

describe('valueHint', () => {
  test('drops every (n of m) and changes nothing else', () => {
    expect(valueHint('Value sits in M15-frame foils (14 of 29) and old-border 1993-frame nonfoils (7 of 14). Skip old-border 1997-frame nonfoils and retro-frame foils (0 of 20).'))
      .toBe('Value sits in M15-frame foils and old-border 1993-frame nonfoils. Skip old-border 1997-frame nonfoils and retro-frame foils.');
    expect(valueHint('Value sits in old-border 1993-frame nonfoils (4 of 17). Skip modern-frame cards, and M15-frame foils (0 of 18).'))
      .toBe('Value sits in old-border 1993-frame nonfoils. Skip modern-frame cards, and M15-frame foils.');
    expect(valueHint('Almost every version is $10.00+ (58 of 74). Check any copy.')).toBe('Almost every version is $10.00+. Check any copy.');
  });
});

describe('resultCardLines hint', () => {
  test('Counterspell: the hint is its summary without the counts', () => {
    const counterspell = read('Counterspell');
    const model = resultModel(game, { match: counterspell, thisVersion: null }, TEN, 'oldest', NO_MARKS);
    const hint = lines(counterspell).hint;
    expect(hint).toBe(valueHint(model.groups[0].summary));
    expect(hint).not.toMatch(/\(\d+ of \d+\)/);
  });
  test('Fireball (quiet) has a hint', () => {
    expect(typeof lines(read('Fireball')).hint).toBe('string');
  });
  test('Bloodfell Caves (nothing at the price) has none', () => {
    expect(lines(read('Bloodfell Caves')).hint).toBeNull();
  });
  test('a known card has none', () => {
    const island = read('Island');
    const marks: KnownMarks = { isKnown: (id) => island.oracleIds.includes(id), kept: () => new Set() };
    expect(lines(island, { marks }).hint).toBeNull();
  });
  test('a token has none', () => {
    expect(lines(read('Saproling')).hint).toBeNull();
  });
});

describe('hintLines', () => {
  const LINE = 18;
  const GAP = 3;
  test('three lines with no notes, two with notes, when there is room', () => {
    expect(hintLines(200, false, LINE, GAP)).toBe(3);
    expect(hintLines(200, true, LINE, GAP)).toBe(2);
  });
  test('cut to what fits, never below one', () => {
    expect(hintLines(39, false, LINE, GAP)).toBe(2);
    expect(hintLines(20, false, LINE, GAP)).toBe(0 + 1);
    expect(hintLines(-10, true, LINE, GAP)).toBe(1);
  });
});
