import path from 'node:path';
import { openNodeDb } from '../../../testing/nodeDb';
import { normalizeName } from '../normalize';
import { cardName, lookupGroups, resolveExact } from '../lookup';
import type { SortOrder, Version } from '../types';
import golden from '../__fixtures__/golden.json';

interface Case {
  query: string; min_cents: number; order: SortOrder; match: string;
  groups: { oracle_id: string; name: string; total_versions: number; summary?: string; qualifying: string[]; unpriced: string[] }[];
}
const cases = golden.cases as Case[];
const db = openNodeDb(path.join(__dirname, '../__fixtures__/golden.sqlite'));
afterAll(() => db.close());

test('golden has 486 cases', () => expect(cases.length).toBe(486));

test.each(cases)('$query at $min_cents ($order)', (c) => {
  const resolved = resolveExact(db, normalizeName(c.query));
  expect(resolved.match).toBe(c.match);
  const keys = (vs: Version[]) => vs.map((x) => x.key);
  const got = lookupGroups(db, resolved.oracleIds, c.min_cents, c.order).map((g) => ({
    oracle_id: g.oracleId, name: g.name, total_versions: g.totalVersions, summary: g.summary,
    qualifying: keys(g.qualifying), unpriced: keys(g.unpriced),
  }));
  expect(got).toEqual(c.groups);
});

test('cardName falls back sensibly', () => {
  const id = cases.find((c) => c.groups.length)!.groups[0];
  expect(cardName(db, id.oracle_id)).toBe(id.name);
});

test("look-alikes: Ihsan's Shade at $10+ has one, the white-border Anthologies version", () => {
  const { oracleIds } = resolveExact(db, normalizeName("Ihsan's Shade"));
  const [g] = lookupGroups(db, oracleIds, 1000, 'oldest');
  expect(g.lookAlikes.map((x) => [x.setName, x.priceCents, x.lookFor])).toEqual([
    ['Anthologies', 20, 'art by Christopher Rush, white border'],
  ]);
});

test('look-alikes: none when nothing is at the price', () => {
  const { oracleIds } = resolveExact(db, normalizeName('Bloodfell Caves'));
  expect(lookupGroups(db, oracleIds, 1000, 'oldest')[0].lookAlikes).toEqual([]);
});
