import { linesFromText, titleCandidates, OcrLine } from '../lines';

// ocr-plus reports a skewed x/y, so these deliberately disagree with the centre and size.
const frame = (cx: number, cy: number) => ({ boundingCenterX: cx, boundingCenterY: cy, x: -99, y: -99, width: 10, height: 6 });
const line = (text: string, x: number, y: number, width = 10, height = 5): OcrLine => ({ text, x, y, width, height });

describe('linesFromText', () => {
  it('flattens blocks into lines in block order', () => {
    const out = linesFromText({
      blocks: [
        { lines: [{ lineText: 'a', lineFrame: frame(10, 20) }, { lineText: 'b', lineFrame: frame(30, 40) }] },
        { lines: [{ lineText: 'c', lineFrame: frame(50, 60) }] },
      ],
    });
    expect(out.map((l) => l.text)).toEqual(['a', 'b', 'c']);
  });
  it('takes the top-left corner from the centre and size, not the skewed x and y', () => {
    const out = linesFromText({ blocks: [{ lines: [{ lineText: 'a', lineFrame: frame(10, 20) }] }] });
    expect(out).toEqual([{ text: 'a', x: 5, y: 17, width: 10, height: 6 }]);
  });
});

describe('titleCandidates', () => {
  it('joins a separate mana-cost line into the title row, left to right, then tries each line alone', () => {
    // The mana symbols' box starts higher and is taller than the title's.
    const title = line('Fireball', 10, 40, 120, 20);
    const mana = line('XR', 200, 34, 30, 30);
    const typeLine = line('Sorcery', 10, 300, 90, 20);
    expect(titleCandidates([typeLine, mana, title])).toEqual(['Fireball XR', 'Fireball', 'XR']);
  });
  it('gives one candidate for a single-line row', () => {
    expect(titleCandidates([line('Sorcery', 0, 300), line('Fireball', 0, 40)])).toEqual(['Fireball']);
  });
  it('leaves a lower row out', () => {
    const out = titleCandidates([line('Fireball', 10, 40, 120, 20), line('Sorcery', 10, 70, 90, 20)]);
    expect(out).toEqual(['Fireball']);
    expect(out.join(' ')).not.toContain('Sorcery');
  });
  it('skips blank lines', () => {
    expect(titleCandidates([line('  ', 0, 10, 100, 40), line('Fireball', 0, 40)])).toEqual(['Fireball']);
    expect(titleCandidates([line('', 0, 0), line('   ', 5, 0)])).toEqual([]);
  });
  it('trims each line before joining', () => {
    expect(titleCandidates([line(' Fireball ', 10, 40, 120, 20), line('XR ', 200, 40, 30, 20)])[0]).toBe('Fireball XR');
  });
  it('is empty for no lines', () => {
    expect(titleCandidates([])).toEqual([]);
  });
});
