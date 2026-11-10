// Rows reused across calls: matching runs on every camera read, so it doesn't allocate per name.
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);

/**
 * Levenshtein distance when it is at most maxD; otherwise some number above maxD. Only the band of
 * cells within maxD of the diagonal is filled, and it gives up once a whole row exceeds maxD.
 */
export function levenshtein(a: string, b: string, maxD: number): number {
  const n = a.length;
  const m = b.length;
  const far = maxD + 1;
  if (Math.abs(n - m) > maxD) return far;
  if (rowA.length < m + 2) {
    rowA = new Int32Array(m + 2);
    rowB = new Int32Array(m + 2);
  }
  let prev = rowA;
  let cur = rowB;
  for (let j = 0; j <= m + 1; j++) prev[j] = j <= maxD ? j : far;
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, i - maxD);
    const hi = Math.min(m, i + maxD);
    cur[lo - 1] = lo === 1 && i <= maxD ? i : far;
    let rowMin = cur[lo - 1];
    const ca = a.charCodeAt(i - 1);
    for (let j = lo; j <= hi; j++) {
      let v = prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1);
      if (prev[j] + 1 < v) v = prev[j] + 1;
      if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
      if (v > far) v = far;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (hi < m) cur[hi + 1] = far;
    if (rowMin > maxD) return far;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return prev[m];
}
