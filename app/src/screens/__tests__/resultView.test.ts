import type { Version } from '../../game/types';
import {
  countLine, formatBytes, formatPriceDate, missingVersionLine, nothingLines,
  parsePrice, readAsLine, rowViews, stickyLine,
} from '../resultView';

function v(over: Partial<Version>): Version {
  const scryfallId = over.scryfallId ?? 'id1';
  const finish = over.finish ?? 'nonfoil';
  return {
    scryfallId, setCode: 'zet', setName: 'The Zeta Set', collectorNumber: '1',
    releasedAt: '2020-01-01', lang: 'en', finish, priceCents: 1399, frameGroup: 'modern',
    quietKind: '', lookFor: 'Look for the thing', notes: [], sameAs: [], symbolSet: null,
    key: `${scryfallId}:${finish}`, ...over,
  } as Version;
}

describe('rowViews', () => {
  const a = v({ scryfallId: 'a', collectorNumber: '57' });
  const b = v({ scryfallId: 'b', collectorNumber: '178', finish: 'foil', priceCents: null, symbolSet: 'none' });
  const c = v({ scryfallId: 'c', setName: 'Lone Set', collectorNumber: '9' });
  const byKey = new Map([a, b, c].map((x) => [x.key, x]));

  it('tags numbers only for repeated set names', () => {
    const rows = rowViews([a, b, c], byKey, null);
    expect(rows.map((r) => r.numberTag)).toEqual(['#57', '#178', null]);
  });
  it('fills finish, price, symbol and key fields', () => {
    const rows = rowViews([a, b, c], byKey, 'b');
    expect(rows[0]).toMatchObject({
      key: 'a:nonfoil', scryfallId: 'a', setName: 'The Zeta Set', finishTag: null, price: '$13.99',
      symbolSet: null, noSymbol: false, lookFor: 'Look for the thing', notes: [], sameAs: null, thisVersion: false,
    });
    expect(rows[1]).toMatchObject({ finishTag: 'foil', price: 'unpriced', symbolSet: 'none', noSymbol: true, thisVersion: true });
  });
  it('marks this version by Scryfall ID, in every finish', () => {
    const bNonfoil = v({ scryfallId: 'b', collectorNumber: '178' });
    const rows = rowViews([a, bNonfoil, b], new Map(), 'b');
    expect(rows.map((r) => r.thisVersion)).toEqual([false, true, true]);
    expect(rowViews([a, b], new Map(), 'b:foil').map((r) => r.thisVersion)).toEqual([false, false]);
  });
  it('tags etched', () => {
    const e = v({ scryfallId: 'e', finish: 'etched' });
    expect(rowViews([e], new Map(), null)[0].finishTag).toBe('etched');
  });
  it('builds sameAs sentences', () => {
    const one = v({ scryfallId: 'o', sameAs: [a.key] });
    const two = v({ scryfallId: 't', sameAs: [a.key, b.key] });
    const three = v({ scryfallId: 'h', sameAs: [a.key, b.key, c.key, 'gone:foil'] });
    const none = v({ scryfallId: 'n', sameAs: ['gone:foil'] });
    const map = new Map([...byKey, ...[one, two, three, none].map((x) => [x.key, x] as [string, Version])]);
    const rows = rowViews([one, two, three, none], map, null);
    expect(rows[0].sameAs).toBe('Looks the same as The Zeta Set #57 ($13.99). Check a reference image.');
    expect(rows[1].sameAs).toBe(
      'Looks the same as The Zeta Set #57 ($13.99) and The Zeta Set #178 foil (unpriced). Check a reference image.');
    expect(rows[2].sameAs).toBe(
      'Looks the same as The Zeta Set #57 ($13.99), The Zeta Set #178 foil (unpriced) and Lone Set #9 ($13.99). Check a reference image.');
    expect(v({ sameAs: [] }).sameAs).toEqual([]);
    expect(rowViews([v({ scryfallId: 'z' })], new Map(), null)[0].sameAs).toBeNull();
  });
});

describe('lines', () => {
  it('countLine', () => {
    expect(countLine(4, 49, 1000)).toBe('4 of 49 versions at $10+');
    expect(countLine(1, 1, 1000)).toBe('1 of 1 version at $10+');
  });
  it('stickyLine', () => {
    expect(stickyLine(4, 7, 1000)).toBe('4 at $10+ · 7 unpriced');
    expect(stickyLine(4, 0, 1000)).toBe('4 at $10+');
  });
  it('nothingLines', () => {
    expect(nothingLines(26, 1000)).toEqual(['Nothing at $10+', '0 of 26 versions. No alert.']);
    expect(nothingLines(1, 750)).toEqual(['Nothing at $7.50+', '0 of 1 version. No alert.']);
  });
  it('readAsLine', () => {
    expect(readAsLine('Bloodfell Caues')).toBe('Read as “Bloodfell Caues”. Not this card? Tap Search.');
  });
  it('missingVersionLine', () => {
    expect(missingVersionLine('MOM', '123', 1000)).toBe("This version (MOM #123) isn't at $10+.");
  });
});

describe('formatPriceDate', () => {
  it('omits the year when it matches', () => {
    expect(formatPriceDate('2026-11-04', new Date(2026, 10, 9))).toBe('Nov 4');
  });
  it('adds the year otherwise', () => {
    expect(formatPriceDate('2026-11-04', new Date(2027, 0, 2))).toBe('Nov 4, 2026');
    expect(formatPriceDate('2025-01-15', new Date(2026, 0, 2))).toBe('Jan 15, 2025');
  });
});

describe('parsePrice', () => {
  it('accepts', () => {
    expect(parsePrice('7')).toBe(700);
    expect(parsePrice('7.5')).toBe(750);
    expect(parsePrice('7.50')).toBe(750);
    expect(parsePrice('$7.50')).toBe(750);
    expect(parsePrice(' 12 ')).toBe(1200);
    expect(parsePrice('100000')).toBe(10_000_000);
    expect(parsePrice('0.01')).toBe(1);
  });
  it('rejects', () => {
    for (const t of ['', '0', '-3', 'abc', '7.555', '100000.01', '100001', '$', '7.', '1e3']) {
      expect(parsePrice(t)).toBeNull();
    }
  });
});

describe('formatBytes', () => {
  it('rounds to whole MB', () => {
    expect(formatBytes(56_012_800)).toBe('56 MB');
    expect(formatBytes(1_000_000)).toBe('1 MB');
    expect(formatBytes(999_999)).toBe('<1 MB');
    expect(formatBytes(0)).toBe('<1 MB');
  });
});
