import { linesFromText, topLine, OcrLine } from '../lines';

const frame = (x: number, y: number) => ({ x, y, width: 10, height: 5 });
const line = (text: string, x: number, y: number): OcrLine => ({ text, x, y, width: 10, height: 5 });

describe('linesFromText', () => {
  it('flattens blocks into lines in block order', () => {
    const out = linesFromText({
      blocks: [
        { lines: [{ lineText: 'a', lineFrame: frame(1, 2) }, { lineText: 'b', lineFrame: frame(3, 4) }] },
        { lines: [{ lineText: 'c', lineFrame: frame(5, 6) }] },
      ],
    });
    expect(out).toEqual([line('a', 1, 2), line('b', 3, 4), line('c', 5, 6)]);
  });
});

describe('topLine', () => {
  it('picks the smallest y', () => {
    expect(topLine([line('Sorcery', 0, 300), line('Fireball', 0, 40)])?.text).toBe('Fireball');
  });
  it('ignores blank text', () => {
    expect(topLine([line('  ', 0, 10), line('Fireball', 0, 40)])?.text).toBe('Fireball');
  });
  it('breaks a y tie by smaller x', () => {
    expect(topLine([line('Right', 50, 40), line('Left', 5, 40)])?.text).toBe('Left');
  });
  it('is null for no lines', () => {
    expect(topLine([])).toBeNull();
  });
});
