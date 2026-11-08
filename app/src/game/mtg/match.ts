import { normalizeName } from './normalize';
import type { NameKind } from './types';

export interface LineMatch {
  norm: string;
  kind: 'exact' | 'tolerant';
  isToken: boolean;
  similarity: number;
  lineUsed: string;
}

export interface NameIndex {
  norms: string[];
  kinds: NameKind[];
  byNorm: Map<string, number>;
  grams: Map<string, number[]>;
  counts: Int32Array;
}

const KIND_RANK: Record<NameKind, number> = { full: 0, face: 1, token: 2 };
const MANA_WORD = /^[0-9wubrgcxso]{1,6}$/;
const MAX_TRIES = 4;
const TOP_CANDIDATES = 50;

function trigrams(norm: string): Set<string> {
  const padded = ` ${norm} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

export function buildNameIndex(entries: Array<[string, NameKind]>): NameIndex {
  const best = new Map<string, NameKind>();
  for (const [norm, kind] of entries) {
    const have = best.get(norm);
    if (have === undefined || KIND_RANK[kind] < KIND_RANK[have]) best.set(norm, kind);
  }
  const norms = [...best.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const kinds = norms.map((n) => best.get(n) as NameKind);
  const byNorm = new Map<string, number>();
  const grams = new Map<string, number[]>();
  norms.forEach((norm, i) => {
    byNorm.set(norm, i);
    for (const g of trigrams(norm)) {
      const list = grams.get(g);
      if (list) list.push(i);
      else grams.set(g, [i]);
    }
  });
  return { norms, kinds, byNorm, grams, counts: new Int32Array(norms.length) };
}

// Levenshtein distance, giving up (returning maxD + 1) once it must exceed maxD.
function levenshtein(a: string, b: string, maxD: number): number {
  if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b.charCodeAt(j - 1) ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxD) return maxD + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

interface Tolerant { idx: number; similarity: number; shared: number }

function tolerant(index: NameIndex, text: string): Tolerant | null {
  const { counts, grams, norms } = index;
  const touched: number[] = [];
  for (const g of trigrams(text)) {
    const list = grams.get(g);
    if (!list) continue;
    for (const i of list) {
      if (counts[i] === 0) touched.push(i);
      counts[i]++;
    }
  }
  const cands = touched
    .map((i) => ({ i, shared: counts[i] }))
    .sort((a, b) => b.shared - a.shared || (norms[a.i] < norms[b.i] ? -1 : 1))
    .slice(0, TOP_CANDIDATES);
  for (const i of touched) counts[i] = 0;

  let best: Tolerant | null = null;
  for (const { i, shared } of cands) {
    const norm = norms[i];
    const L = Math.max(text.length, norm.length);
    if (Math.abs(text.length - norm.length) * 5 > L) continue;
    const maxD = Math.floor(L / 5);
    const d = levenshtein(text, norm, maxD);
    if (5 * d > L) continue;
    const similarity = 1 - d / L;
    if (
      best === null ||
      similarity > best.similarity ||
      (similarity === best.similarity &&
        (shared > best.shared || (shared === best.shared && norm < norms[best.idx])))
    ) {
      best = { idx: i, similarity, shared };
    }
  }
  return best;
}

export function matchLine(index: NameIndex, raw: string): LineMatch | null {
  let words = normalizeName(raw).split(' ');
  const tries = [words.join(' ')];
  while (tries.length < MAX_TRIES && words.length > 1 && MANA_WORD.test(words[words.length - 1])) {
    words = words.slice(0, -1);
    tries.push(words.join(' '));
  }
  for (const t of tries) {
    const idx = index.byNorm.get(t);
    if (idx !== undefined) {
      return { norm: t, kind: 'exact', isToken: index.kinds[idx] === 'token', similarity: 1, lineUsed: t };
    }
  }
  let best: (Tolerant & { lineUsed: string }) | null = null;
  for (const t of tries) {
    if (t === '') continue;
    const r = tolerant(index, t);
    if (r && (best === null || r.similarity > best.similarity)) best = { ...r, lineUsed: t };
  }
  if (!best) return null;
  return {
    norm: index.norms[best.idx],
    kind: 'tolerant',
    isToken: index.kinds[best.idx] === 'token',
    similarity: best.similarity,
    lineUsed: best.lineUsed,
  };
}

export function prefixMatches(index: NameIndex, typed: string, limit: number): string[] {
  const prefix = normalizeName(typed);
  const out: string[] = [];
  index.norms.forEach((norm, i) => {
    if (index.kinds[i] !== 'token' && norm.startsWith(prefix)) out.push(norm);
  });
  out.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return out.slice(0, limit);
}
