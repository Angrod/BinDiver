import path from 'node:path';
import { openNodeDb } from '../../../testing/nodeDb';
import { oldFormatCopy } from '../../../testing/oldFormat';
import { dataFeatures } from '../features';

const golden = path.join(__dirname, '../__fixtures__/golden.sqlite');

test('the golden database has every feature', () => {
  const db = openNodeDb(golden);
  expect(dataFeatures(db)).toEqual({ quietKind: true, numberSearch: true });
  db.close();
});

test('an old-format copy has none', () => {
  const db = oldFormatCopy(golden);
  expect(dataFeatures(db)).toEqual({ quietKind: false, numberSearch: false });
  db.close();
});
