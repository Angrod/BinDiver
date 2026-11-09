import { buildNameIndex, levenshtein, looseLine, matchLine, prefixMatches } from '../match';
import { normalizeName } from '../normalize';
import type { NameKind } from '../types';
import names from '../__fixtures__/names.json';
import misreads from '../__fixtures__/misreads.json';

const entries = names as Array<[string, NameKind]>;
const buildStart = performance.now();
const index = buildNameIndex(entries);
const buildMs = performance.now() - buildStart;

test('each misread finds its card', () => {
  const misses = (misreads as [string, string][])
    .map(([read, expected]) => ({ read, want: normalizeName(expected), got: matchLine(index, read)?.norm ?? null }))
    .filter((c) => c.got !== c.want);
  expect(misses).toEqual([]);
});

test('junk lines match nothing', () => {
  for (const junk of ['Creature — Elf Druid', 'Instant', 'Illus. Mark Poole', '© 1993 Wizards of the Coast', 'Tap: Add G', 'xkcd qwerty']) {
    expect([junk, matchLine(index, junk)]).toEqual([junk, null]);
  }
});

test('exact names match themselves', () => {
  for (let i = 0; i < 200; i++) {
    const norm = entries[i * 187][0];
    expect(matchLine(index, norm)).toMatchObject({ norm, kind: 'exact', similarity: 1 });
  }
});

test('longest exact name wins over a dropped word', () => {
  expect(matchLine(index, 'Island Sanctuary 1W')).toMatchObject({
    norm: 'island sanctuary', kind: 'exact', lineUsed: 'island sanctuary',
  });
});

test('tokens are flagged', () => {
  expect(matchLine(index, 'Saproling')).toMatchObject({ isToken: true, kind: 'exact' });
});

test('misreads average under 20 ms', () => {
  const start = performance.now();
  for (const [read] of misreads as [string, string][]) matchLine(index, read);
  const avg = (performance.now() - start) / misreads.length;
  console.log(`index build ${buildMs.toFixed(0)} ms; ${avg.toFixed(2)} ms per misread line`);
  expect(avg).toBeLessThan(20);
});

test('prefix matches by length then name', () => {
  expect(prefixMatches(index, 'fireb', 6)).toEqual([
    'fireball', 'firebolt', 'fireblast', 'firebending', 'firebreathing', 'fireborn knight',
  ]);
});

// Run 4 (Nov 9): "_____ _____ Rocketship" is stored as "_ _ rocketship", but the camera reads only the
// printed words ("Rocketship 4", 45 reads), so blank-name cards are also indexed without their blanks.
describe('blank-name cards', () => {
  it('match the words printed around their blanks', () => {
    for (const [line, norm] of [
      ['Rocketship 4', '_ _ rocketship'], ['Balls of Fire', '_ balls of fire'], ['Knight in Armor', 'knight in _ armor'],
      ['Bird Gets the Worm', '_ bird gets the worm'], ['-o-saurus', '_ o saurus'], ['Sort of and', 'sort of _ and _'],
    ]) {
      expect([line, matchLine(index, line)]).toEqual([line, expect.objectContaining({ norm, kind: 'exact' })]);
    }
  });
  it('match a misread of those words tolerantly', () => {
    expect(matchLine(index, 'rockefship')).toMatchObject({ norm: '_ _ rocketship', kind: 'tolerant', lineUsed: 'rockefship' });
  });
  it('still match their full stored names', () => {
    expect(matchLine(index, '_____ _____ Rocketship')).toMatchObject({ norm: '_ _ rocketship', kind: 'exact' });
  });
  it('get no key when the words are inside other names, so a half-read card cannot land on them', () => {
    for (const blank of ['_ goblin', '_ _ _ trespasser', 'wizards of the _', '_']) {
      expect([blank, index.targets.filter((t) => t === blank).length]).toEqual([blank, 1]);
    }
    expect(matchLine(index, 'goblin')?.norm).not.toBe('_ goblin');
    // Not a key: "wizards of the" is 2 letters from the stored name, so the tolerant tier matched it before.
    expect(matchLine(index, 'wizards of the')).toMatchObject({ norm: 'wizards of the _', kind: 'tolerant' });
  });
  it('suggest the stored name once when typed', () => {
    expect(prefixMatches(index, 'rocketsh', 5)).toEqual(['_ _ rocketship']);
    expect(prefixMatches(index, '_ _ rock', 5)).toEqual(['_ _ rocketship']);
  });
  it('need exactly one card behind the words left over', () => {
    const i = buildNameIndex([['_ sky', 'full'], ['sky _', 'full'], ['_ moon', 'full'], ['_', 'full']]);
    expect(matchLine(i, 'sky')).toBeNull();
    expect(matchLine(i, 'moon')).toMatchObject({ norm: '_ moon', kind: 'exact' });
    expect(i.norms).toHaveLength(5);
  });
});

// Known risk, kept for gate tuning (no matcher change): some rules-text keywords are exact card names,
// so a rules line read inside the title band matches that card. "Flashback {2}{R}" loses its mana word
// and still lands on Flashback. This pins today's behaviour; revisit if the gate shows such reads.
test('known risk: rules-text keywords that are card names match as titles', () => {
  for (const [line, norm] of [['Flash', 'flash'], ['Flashback {2}{R}', 'flashback'], ['Landfall', 'landfall']]) {
    expect([line, matchLine(index, line)]).toEqual([line, expect.objectContaining({ norm, kind: 'exact' })]);
  }
});

test('a title row joined with its mana-cost line still matches the title', () => {
  expect(matchLine(index, 'Fireball XR')).toMatchObject({ norm: 'fireball', kind: 'exact' });
});

// Run 1 on the iPhone 13: ML Kit read the mana cost next to the title as short digit-led junk.
test('digit-led junk after a title is dropped', () => {
  for (const [line, norm] of [
    ['Merchant of Secrets 2e)', 'merchant of secrets'],
    ['Call the Mountain Chocobo 3e', 'call the mountain chocobo'],
    ['Retrieve the Esper 30)', 'retrieve the esper'],
  ]) {
    expect([line, matchLine(index, line)]).toEqual([line, expect.objectContaining({ norm, kind: 'exact', lineUsed: norm })]);
  }
});

// Run 1: old-frame titles read this badly stayed unmatched at the 0.8 cutoff, costing 9 to 18 s a card.
const OLD_FRAME_GARBLES: Array<[string, string]> = [
  ['cpopsraríon', 'Cooperation'],
  ['coopgraci9n', 'Cooperation'],
  ['drougic', 'Drought'],
  ['drougr', 'Drought'],
  ['cirele ofprorectí9n blcks 1', 'Circle of Protection: Black'],
  ['circl of9rorectíoth whíre 1', 'Circle of Protection: White'],
  // Runs 2 and 3 (Nov 9): run 3 committed the first; the other two were unmatched in run 2.
  ['ballisca guad', 'Ballista Squad'],
  ['ballisca yguad', 'Ballista Squad'],
  ['radants drag903', "Radiant's Dragoons"],
];

test('a loose camera match finds badly garbled old-frame titles the default misses', () => {
  for (const [read, name] of OLD_FRAME_GARBLES) {
    expect([read, matchLine(index, read)]).toEqual([read, null]);
    expect([read, looseLine(index, read)]).toEqual([read, expect.objectContaining({ norm: normalizeName(name), kind: 'loose' })]);
  }
});

// Run 1: half-slid titles. Read from the middle of a word, they look like other cards at 0.7.
test('a loose match needs the read to start like the name and have 6 letters', () => {
  for (const partial of ['nof evil', 'vdration', 'vwurning', 'are', 'sand']) {
    expect([partial, looseLine(index, partial)]).toEqual([partial, null]);
  }
});

test('a loose match too close to call matches nothing', () => {
  // Run 1: as close to Coercion as to Cooperation (8 of 11 letters right for each).
  expect(looseLine(index, 'cogperucion')).toBeNull();
});

test('junk lines match nothing loosely either', () => {
  for (const junk of ['Creature — Elf Druid', 'Instant', 'Illus. Mark Poole', '© 1993 Wizards of the Coast', 'Tap: Add G', 'xkcd qwerty']) {
    expect([junk, looseLine(index, junk)]).toEqual([junk, null]);
  }
});

test('loose lines average under 20 ms', () => {
  const lines = [...OLD_FRAME_GARBLES.map(([read]) => read), 'nof evil', 'vdration', 'sandstone', 'Creature — Elf Druid'];
  const start = performance.now();
  for (let i = 0; i < 5; i++) for (const line of lines) looseLine(index, line);
  const avg = (performance.now() - start) / (5 * lines.length);
  console.log(`${avg.toFixed(2)} ms per loose line`);
  expect(avg).toBeLessThan(20);
});

function plainLevenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(up + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

test('levenshtein gives the distance when within maxD, else more than maxD', () => {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const word = () => Array.from({ length: rand(14) }, () => 'abcde'[rand(5)]).join('');
  for (let k = 0; k < 3000; k++) {
    const a = word();
    const b = word();
    const maxD = rand(6);
    const want = plainLevenshtein(a, b);
    const got = levenshtein(a, b, maxD);
    if (want <= maxD) expect([a, b, maxD, got]).toEqual([a, b, maxD, want]);
    else expect([a, b, maxD, got > maxD]).toEqual([a, b, maxD, true]);
  }
});
