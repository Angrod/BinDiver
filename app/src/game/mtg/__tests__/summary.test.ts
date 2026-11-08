import { dollars } from '../money';

test('dollars formats cents', () => {
  expect(dollars(5)).toBe('$0.05');
  expect(dollars(1000)).toBe('$10.00');
  expect(dollars(123456)).toBe('$1,234.56');
});
