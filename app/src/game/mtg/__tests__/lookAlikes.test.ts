import { findLookAlikes } from '../lookAlikes';
import type { Version } from '../types';

let n = 0;
function v(setName: string, frameGroup: string, finish: string, priceCents: number | null, releasedAt = '2000-01-01'): Version {
  n += 1;
  return {
    scryfallId: `id${n}`, setCode: `s${n}`, setName, collectorNumber: String(n), releasedAt, lang: 'en', finish,
    priceCents, frameGroup, lookFor: '', notes: [], sameAs: [], symbolSet: null, quietKind: '', key: `id${n}:${finish}`,
  };
}

describe('findLookAlikes', () => {
  test('a priced version under the price, in the same frame and finish as one at the price', () => {
    const arn = v('Arabian Nights', 'old-1993', 'nonfoil', 5140, '1993-12-17');
    const chr = v('Chronicles', 'old-1993', 'nonfoil', 14, '1995-07-01');
    const fifth = v('Fifth Edition', 'old-1997', 'nonfoil', 30, '1997-03-24');
    const unpriced = v('Chronicles Foreign Black Border', 'old-1993', 'nonfoil', null, '1995-07-01');
    expect(findLookAlikes([arn, chr, fifth, unpriced], 200, 'oldest')).toEqual([chr]);
  });

  test('foil and etched count as one finish; nonfoil is another', () => {
    const foil = v('Promo', 'm15', 'foil', 2000);
    const etched = v('Etched', 'm15', 'etched', 100);
    const nonfoil = v('Core', 'm15', 'nonfoil', 100);
    expect(findLookAlikes([foil, etched, nonfoil], 1000, 'oldest')).toEqual([etched]);
  });

  test('none when nothing is at the price, or everything priced is', () => {
    const a = v('A', 'm15', 'nonfoil', 50);
    const b = v('B', 'm15', 'nonfoil', 80);
    expect(findLookAlikes([a, b], 1000, 'oldest')).toEqual([]);
    expect(findLookAlikes([a, b], 50, 'oldest')).toEqual([]);
  });

  test("in the list's sort order", () => {
    const top = v('Top', 'm15', 'nonfoil', 5000, '2020-01-01');
    const old = v('Old', 'm15', 'nonfoil', 90, '2015-01-01');
    const recent = v('Recent', 'm15', 'nonfoil', 10, '2024-01-01');
    expect(findLookAlikes([top, recent, old], 1000, 'oldest')).toEqual([old, recent]);
    expect(findLookAlikes([top, old, recent], 1000, 'newest')).toEqual([recent, old]);
    expect(findLookAlikes([top, recent, old], 1000, 'price')).toEqual([old, recent]);
  });
});
