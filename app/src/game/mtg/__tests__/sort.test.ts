import { sortVersions } from '../sort';
import type { Version } from '../types';

function v(setCode: string, collectorNumber: string, finish: string, priceCents: number | null, releasedAt = '2020-01-01'): Version {
  const scryfallId = `${setCode}-${collectorNumber}`;
  return {
    scryfallId, setCode, setName: setCode, collectorNumber, releasedAt, lang: 'en', finish,
    priceCents, frameGroup: '', lookFor: '', notes: [], sameAs: [], symbolSet: null, quietKind: '',
    key: `${scryfallId}:${finish}`,
  };
}
const keys = (xs: Version[]) => xs.map((x) => x.key);

const tie = [
  v('b', '1', 'etched', 5), v('b', '1', 'foil', 5), v('b', '1', 'nonfoil', 5),
  v('a', '10', 'nonfoil', 5), v('a', '9', 'nonfoil', 5),
  v('a', '67★', 'nonfoil', 5), v('a', '67', 'nonfoil', 5),
];
const tieOrder = [
  'a-9:nonfoil', 'a-10:nonfoil', 'a-67:nonfoil', 'a-67★:nonfoil',
  'b-1:nonfoil', 'b-1:foil', 'b-1:etched',
];

test('same-day versions sort by set, number, then finish', () => {
  expect(keys(sortVersions(tie, 'oldest'))).toEqual(tieOrder);
});

test('newest keeps tie order within a day', () => {
  const later = v('z', '1', 'nonfoil', 5, '2021-01-01');
  expect(keys(sortVersions([...tie, later], 'newest'))).toEqual(['z-1:nonfoil', ...tieOrder]);
});

test('price puts unpriced last and keeps tie order between equal prices', () => {
  const input = [
    v('a', '2', 'nonfoil', null), v('a', '1', 'nonfoil', 5), v('a', '3', 'nonfoil', 9),
    v('a', '4', 'nonfoil', 5), v('a', '0', 'nonfoil', null),
  ];
  expect(keys(sortVersions(input, 'price'))).toEqual([
    'a-3:nonfoil', 'a-1:nonfoil', 'a-4:nonfoil', 'a-0:nonfoil', 'a-2:nonfoil',
  ]);
});
