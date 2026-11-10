import { levenshtein } from '../levenshtein';

function plainLevenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(up + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

test('levenshtein gives the distance when within maxD, else more than maxD', () => {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const word = () => Array.from({ length: rand(14) }, () => 'abcde'[rand(5)]).join('');
  for (let k = 0; k < 3000; k++) {
    const a = word();
    const b = word();
    const maxD = rand(6);
    const want = plainLevenshtein(a, b);
    const got = levenshtein(a, b, maxD);
    if (want <= maxD) expect([a, b, maxD, got]).toEqual([a, b, maxD, want]);
    else expect([a, b, maxD, got > maxD]).toEqual([a, b, maxD, true]);
  }
});
