/** The most distinct unmatched texts one run keeps. */
export const UNMATCHED_CAP = 200;
/** Shorter texts are scraps of a card sliding in, not lines worth tuning for. */
export const UNMATCHED_MIN_LETTERS = 3;

export interface UnmatchedRow { text: string; count: number }

/** A light, game-neutral normalization so the same read counts once: lowercase, no punctuation, single spaces. */
export function normalizeLine(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Counts the distinct candidate texts that matched nothing during a run. */
export class UnmatchedLines {
  private readonly counts = new Map<string, number>();

  constructor(private readonly cap: number = UNMATCHED_CAP) {}

  /**
   * Counts one unmatched text by its normalized form. Texts with fewer than UNMATCHED_MIN_LETTERS letters
   * are ignored; new texts past the cap are dropped.
   */
  add(text: string): void {
    const norm = normalizeLine(text);
    if ((norm.match(/\p{L}/gu)?.length ?? 0) < UNMATCHED_MIN_LETTERS) return;
    const have = this.counts.get(norm);
    if (have !== undefined) this.counts.set(norm, have + 1);
    else if (this.counts.size < this.cap) this.counts.set(norm, 1);
  }

  /** Most frequent first, ties by text; at most `limit` rows. */
  top(limit: number = Number.POSITIVE_INFINITY): UnmatchedRow[] {
    return [...this.counts]
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
      .slice(0, limit);
  }
}

function field(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The unmatched texts as CSV: header text,count, RFC 4180 quoting. */
export function unmatchedToCsv(rows: UnmatchedRow[]): string {
  return ['text,count', ...rows.map((r) => `${field(r.text)},${r.count}`)].join('\n') + '\n';
}
