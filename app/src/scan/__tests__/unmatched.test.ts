import { normalizeLine, UNMATCHED_CAP, UNMATCHED_MIN_LETTERS, UnmatchedLines, unmatchedToCsv } from '../unmatched';

describe('normalizeLine', () => {
  it('lowercases, drops apostrophes and punctuation, and collapses spaces', () => {
    expect(normalizeLine('  Tap: Add {G}.  ')).toBe('tap add g');
    expect(normalizeLine("Urza's  Mine")).toBe('urzas mine');
    expect(normalizeLine('Æther Vial')).toBe('æther vial');
  });
});

describe('UnmatchedLines', () => {
  it('counts distinct normalized texts, most frequent first, ties by text', () => {
    const u = new UnmatchedLines();
    for (const t of ['Flying', 'Tap: Add G', 'tap add g', 'Illus. Poole', 'flying', 'TAP ADD G']) u.add(t);
    expect(u.top()).toEqual([
      { text: 'tap add g', count: 3 },
      { text: 'flying', count: 2 },
      { text: 'illus poole', count: 1 },
    ]);
  });
  it('ignores blank texts', () => {
    const u = new UnmatchedLines();
    u.add('  ');
    u.add('{}');
    expect(u.top()).toEqual([]);
  });
  // Run 3 (Nov 9): 16 of 73 unmatched lines were 1-2 letter scraps of cards sliding in.
  it('leaves out scraps with fewer than 3 letters', () => {
    const u = new UnmatchedLines();
    for (const t of ['ri', 'g', '1 1', 'a 0', '3', 'em', 'Æt', 'abe', 'em lds', 'æther']) u.add(t);
    expect(u.top().map((r) => r.text)).toEqual(['abe', 'em lds', 'æther']);
    expect(UNMATCHED_MIN_LETTERS).toBe(3);
  });
  it('limits the list it returns', () => {
    const u = new UnmatchedLines();
    for (let i = 0; i < 60; i++) u.add(`line ${i}`);
    expect(u.top(50)).toHaveLength(50);
  });
  it('stops taking new texts at the cap but keeps counting known ones', () => {
    const u = new UnmatchedLines(3);
    for (const t of ['aaa', 'bbb', 'ccc', 'ddd', 'aaa']) u.add(t);
    expect(u.top()).toEqual([{ text: 'aaa', count: 2 }, { text: 'bbb', count: 1 }, { text: 'ccc', count: 1 }]);
    expect(UNMATCHED_CAP).toBe(200);
  });
});

describe('unmatchedToCsv', () => {
  it('writes text,count rows with RFC 4180 quoting', () => {
    const csv = unmatchedToCsv([
      { text: 'tap add g', count: 3 },
      { text: 'a, "b"', count: 1 },
    ]);
    expect(csv).toBe('text,count\ntap add g,3\n"a, ""b""",1\n');
  });
  it('is just the header for no rows', () => {
    expect(unmatchedToCsv([])).toBe('text,count\n');
  });
});
