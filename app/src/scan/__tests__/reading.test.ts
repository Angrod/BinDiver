import type { CardGroup } from '../../game/mtg/types';
import type { CardMatch } from '../../game/types';
import { commitKey, displayFrameSize, qualifyingVersions, ReadThrottle } from '../reading';

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

describe('ReadThrottle', () => {
  it('lets the first read through, then one per interval', () => {
    const t = new ReadThrottle(200);
    expect([0, 33, 166, 199, 200, 233, 399, 400].map((ms) => t.accept(ms))).toEqual([
      true, false, false, false, true, false, false, true,
    ]);
  });
});
