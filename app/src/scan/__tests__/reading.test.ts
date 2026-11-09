import type { CardGroup } from '../../game/mtg/types';
import type { CardMatch } from '../../game/types';
import {
  commitKey, displayFrameSize, frameMsPerUnit, matchCandidates, qualifyingVersions, readDue, READ_INTERVAL_MS,
} from '../reading';

const match = (over: Partial<CardMatch>): CardMatch => ({
  oracleIds: [], name: '', match: 'exact', isToken: false, lineUsed: '', ...over,
});

describe('commitKey', () => {
  it('is null for no match', () => {
    expect(commitKey(null)).toBeNull();
  });
  it('joins the oracle IDs', () => {
    expect(commitKey(match({ oracleIds: ['a1', 'b2'], name: 'Fire // Ice' }))).toBe('a1,b2');
  });
  it('falls back to the name for a token', () => {
    expect(commitKey(match({ oracleIds: [], name: 'goblin', isToken: true }))).toBe('goblin');
  });
});

describe('displayFrameSize', () => {
  it('swaps the sides of a quarter-turned frame', () => {
    expect(displayFrameSize({ width: 1920, height: 1080, orientation: 'right' })).toEqual({ width: 1080, height: 1920 });
    expect(displayFrameSize({ width: 1920, height: 1080, orientation: 'left' })).toEqual({ width: 1080, height: 1920 });
  });
  it('keeps an upright or upside-down frame as it is', () => {
    expect(displayFrameSize({ width: 1080, height: 1920, orientation: 'up' })).toEqual({ width: 1080, height: 1920 });
    expect(displayFrameSize({ width: 1080, height: 1920, orientation: 'down' })).toEqual({ width: 1080, height: 1920 });
  });
});

describe('qualifyingVersions', () => {
  it('adds up qualifying versions across groups', () => {
    const g = (q: number) => ({ qualifying: new Array(q).fill({}) }) as unknown as CardGroup;
    expect(qualifyingVersions([])).toBe(0);
    expect(qualifyingVersions([g(2), g(0), g(3)])).toBe(5);
  });
});

describe('readDue', () => {
  it('lets the first read through, then one per interval', () => {
    let last = Number.NEGATIVE_INFINITY;
    const sent = [0, 33, 166, 199, 200, 233, 399, 400].map((ms) => {
      if (!readDue(ms, last, 200)) return false;
      last = ms;
      return true;
    });
    expect(sent).toEqual([true, false, false, false, true, false, false, true]);
  });
  it('uses a 200 ms read interval', () => {
    expect(READ_INTERVAL_MS).toBe(200);
    expect(readDue(1199, 1000, READ_INTERVAL_MS)).toBe(false);
    expect(readDue(1200, 1000, READ_INTERVAL_MS)).toBe(true);
  });
  it('restarts when the clock goes backwards', () => {
    expect(readDue(50, 1000, 200)).toBe(true);
  });
});

describe('frameMsPerUnit', () => {
  it('converts VisionCamera frame timestamps: seconds on iOS, nanoseconds on Android', () => {
    expect(2.5 * frameMsPerUnit('ios')).toBe(2500);
    expect(2_500_000_000 * frameMsPerUnit('android')).toBeCloseTo(2500, 6);
  });
});

describe('matchCandidates', () => {
  // A fake game: strict matches by exact text, loose matches by text starting with "loose:".
  const game = {
    matchTitle(line: string, loose = false): CardMatch | null {
      if (line === 'boom') throw new Error('boom');
      if (line === 'Fireball') return match({ name: 'Fireball', lineUsed: 'fireball' });
      if (loose && line.startsWith('loose:')) return match({ name: line.slice(6), match: 'tolerant' });
      return null;
    },
  };

  test('a strict match on any line beats a loose match on an earlier one', () => {
    expect(matchCandidates(game, ['loose:Firebolt', 'Fireball'])).toMatchObject({
      match: { name: 'Fireball' }, matchedText: 'Fireball',
    });
  });
  test('falls back to a loose match when nothing matches strictly', () => {
    expect(matchCandidates(game, ['junk', 'loose:Drought'])).toMatchObject({
      match: { name: 'Drought', match: 'tolerant' }, matchedText: 'loose:Drought',
    });
  });
  test('lists the lines that matched nothing, skipping one that threw', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(matchCandidates(game, ['junk', 'boom', 'more junk'])).toEqual({
      match: null, matchedText: '', noMatch: ['junk', 'more junk'],
    });
    warn.mockRestore();
  });
});
