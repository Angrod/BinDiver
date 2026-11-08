import { buildNameIndex, matchLine, prefixMatches } from '../match';
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
