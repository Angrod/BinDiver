import { normalizeName } from '../normalize';
import data from '../__fixtures__/normalize.json';

test('normalizeName matches Python on every real card name', () => {
  const cases = data.cases as [string, string][];
  const mismatches = cases
    .map(([raw, norm]) => ({ raw, norm, got: normalizeName(raw) }))
    .filter((c) => c.got !== c.norm);
  expect(mismatches).toEqual([]);
  expect(cases.length).toBeGreaterThan(0);
});
