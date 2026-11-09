import { normalizeName } from './normalize';
import type { NameKind } from './types';

export interface LineMatch {
  norm: string;
  kind: 'exact' | 'tolerant' | 'loose';
  isToken: boolean;
  similarity: number;
  lineUsed: string;
}

export interface NameIndex {
  /** The keys matched against: every stored name, then the blank-free keys of blank-name cards. */
  norms: string[];
  /** The stored name each key stands for: itself, or the blank-name card a blank-free key reads as. */
  targets: string[];
  kinds: NameKind[];
  byNorm: Map<string, number>;
  grams: Map<string, number[]>;
  /** Names by their first character, each list shortest first, for loose matches. */
  byFirst: Map<string, number[]>;
  counts: Int32Array;
}

const KIND_RANK: Record<NameKind, number> = { full: 0, face: 1, token: 2 };
// A trailing word that is a mana cost: mana letters and digits, or a digit then up to two letters or
// digits, which is how the camera reader writes some mana symbols ("2e", "3e", "1a").
const MANA_WORD = /^(?:[0-9wubrgcxso]{1,6}|[0-9][0-9a-z]{0,2})$/;
const MAX_TRIES = 4;
/**
 * Loose matches, for camera reads only: badly garbled old-frame titles sit between this and the 0.8
 * tolerant cutoff. The commit rule's 3 agreeing reads in a row guard against a wrong card, and a loose
 * match must start with the read's first character and the read must have LOOSE_MIN_LETTERS letters,
 * so a title read from the middle of a word, half slid in, doesn't pass for another card.
 */
const LOOSE_SIMILARITY = 0.7;
const LOOSE_MIN_LETTERS = 6;
/** A loose match needs to beat every other name by this much; closer than that is too close to call. */
const LOOSE_MARGIN = 0.02;
const TOP_CANDIDATES = 50;

function trigrams(norm: string): Set<string> {
  const padded = ` ${norm} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/**
 * Keys for blank-name cards ("_____ _____ Rocketship" is stored as "_ _ rocketship"), whose blanks the
 * camera doesn't read: the words left without the blanks, each standing for its one card. Skipped when
 * nothing is left, when two cards leave the same words, or when the words are inside another name, so
 * a half-read card ("goblin" from Goblin Bowling Team) can't land on one ("_____ Goblin").
 */
function blankFreeKeys(stored: string[]): Map<string, string> {
  const sources = new Map<string, string[]>();
  for (const norm of stored) {
    const words = norm.split(' ');
    if (!words.includes('_')) continue;
    const key = words.filter((w) => w !== '_').join(' ');
    if (key === '') continue;
    const list = sources.get(key);
    if (list) list.push(norm);
    else sources.set(key, [norm]);
  }
  const keys = new Map<string, string>();
  for (const [key, from] of sources) {
    if (from.length === 1 && !stored.some((n) => n !== from[0] && n.includes(key))) keys.set(key, from[0]);
  }
  return keys;
}

export function buildNameIndex(entries: Array<[string, NameKind]>): NameIndex {
  const best = new Map<string, NameKind>();
  for (const [norm, kind] of entries) {
    const have = best.get(norm);
    if (have === undefined || KIND_RANK[kind] < KIND_RANK[have]) best.set(norm, kind);
  }
  const stored = [...best.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const extra = [...blankFreeKeys(stored)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const norms = [...stored, ...extra.map(([key]) => key)];
  const targets = [...stored, ...extra.map(([, target]) => target)];
  const kinds = targets.map((n) => best.get(n) as NameKind);
  const byNorm = new Map<string, number>();
  const grams = new Map<string, number[]>();
  const byFirst = new Map<string, number[]>();
  norms.forEach((norm, i) => {
    byNorm.set(norm, i);
    const first = byFirst.get(norm[0]);
    if (first) first.push(i);
    else byFirst.set(norm[0], [i]);
    for (const g of trigrams(norm)) {
      const list = grams.get(g);
      if (list) list.push(i);
      else grams.set(g, [i]);
    }
  });
  for (const list of byFirst.values()) list.sort((x, y) => norms[x].length - norms[y].length || x - y);
  return { norms, targets, kinds, byNorm, grams, byFirst, counts: new Int32Array(norms.length) };
}

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

// The closest name starting with the same character, at LOOSE_SIMILARITY or better; null when another
// name is within LOOSE_MARGIN of it.
function looseMatch(index: NameIndex, text: string): Tolerant | null {
  const { norms } = index;
  const list = index.byFirst.get(text[0]);
  if (!list) return null;
  // Lengths that can be within the cutoff: 0.7 of the text's length up to the text's length / 0.7.
  const shortest = Math.ceil(text.length * LOOSE_SIMILARITY - 1e-9);
  const longest = Math.floor(text.length / LOOSE_SIMILARITY + 1e-9);
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (norms[list[mid]].length < shortest) lo = mid + 1;
    else hi = mid;
  }
  let best: Tolerant | null = null;
  let runnerUp = 0;
  for (let k = lo; k < list.length; k++) {
    const i = list[k];
    const norm = norms[i];
    if (norm.length > longest) break;
    const L = Math.max(text.length, norm.length);
    const maxD = Math.floor(L * (1 - LOOSE_SIMILARITY) + 1e-9);
    const d = levenshtein(text, norm, maxD);
    if (d > maxD) continue;
    const similarity = 1 - d / L;
    if (best === null || similarity > best.similarity) {
      if (best !== null) runnerUp = best.similarity;
      best = { idx: i, similarity, shared: 0 };
    } else if (similarity > runnerUp) {
      runnerUp = similarity;
    }
  }
  return best !== null && best.similarity - runnerUp >= LOOSE_MARGIN - 1e-9 ? best : null;
}

/** A read line normalized, then with up to 3 trailing mana-cost words dropped one at a time. */
function linesToTry(raw: string): string[] {
  let words = normalizeName(raw).split(' ');
  const tries = [words.join(' ')];
  while (tries.length < MAX_TRIES && words.length > 1 && MANA_WORD.test(words[words.length - 1])) {
    words = words.slice(0, -1);
    tries.push(words.join(' '));
  }
  return tries;
}

type Best = (Tolerant & { lineUsed: string }) | null;

function toMatch(index: NameIndex, best: Best, kind: 'tolerant' | 'loose'): LineMatch | null {
  if (!best) return null;
  return {
    norm: index.targets[best.idx],
    kind,
    isToken: index.kinds[best.idx] === 'token',
    similarity: best.similarity,
    lineUsed: best.lineUsed,
  };
}

/** The best name for a read line: exact first, then tolerant at 0.8 or better. */
export function matchLine(index: NameIndex, raw: string): LineMatch | null {
  const tries = linesToTry(raw);
  for (const t of tries) {
    const idx = index.byNorm.get(t);
    if (idx !== undefined) {
      return { norm: index.targets[idx], kind: 'exact', isToken: index.kinds[idx] === 'token', similarity: 1, lineUsed: t };
    }
  }
  let best: Best = null;
  for (const t of tries) {
    if (t === '') continue;
    const r = tolerant(index, t);
    if (r && (best === null || r.similarity > best.similarity)) best = { ...r, lineUsed: t };
  }
  return toMatch(index, best, 'tolerant');
}

/**
 * Only the loose tier, for a camera line matchLine already missed: names starting with the line's
 * first character, at LOOSE_SIMILARITY or better, for lines of LOOSE_MIN_LETTERS letters. Reported
 * as 'loose'.
 */
export function looseLine(index: NameIndex, raw: string): LineMatch | null {
  let best: Best = null;
  for (const t of linesToTry(raw)) {
    if (t.replace(/[^a-z]/g, '').length < LOOSE_MIN_LETTERS) continue;
    const r = looseMatch(index, t);
    if (r && (best === null || r.similarity > best.similarity)) best = { ...r, lineUsed: t };
  }
  return toMatch(index, best, 'loose');
}

export function prefixMatches(index: NameIndex, typed: string, limit: number): string[] {
  const prefix = normalizeName(typed);
  const out: string[] = [];
  index.norms.forEach((norm, i) => {
    const target = index.targets[i];
    if (index.kinds[i] !== 'token' && norm.startsWith(prefix) && !out.includes(target)) out.push(target);
  });
  out.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return out.slice(0, limit);
}
