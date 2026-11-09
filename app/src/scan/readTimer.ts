import { levenshtein } from '../game/mtg/match';
import { normalizeLine } from './unmatched';

/** Unmatched text at least this close to the card just committed is taken as more reads of it. */
const SAME_CARD_SIMILARITY = 0.5;
const MIN_LETTERS = 3;

function similarity(a: string, b: string): number {
  const L = Math.max(a.length, b.length);
  return L === 0 ? 1 : 1 - levenshtein(a, b, L) / L;
}

/**
 * Times how long the reader took on each card: from the first read showing something other than the
 * card just committed (the next card arriving) to that card's commit. Reads of the last card, reads
 * that look like it and didn't match another card exactly, and reads under 3 letters (a mana cost)
 * don't start the clock. Time with the camera off doesn't count.
 */
export class ReadTimer {
  private since: number | null = null;
  private lastKey: string | null = null;
  private lastName = '';

  /**
   * One camera read: its time, the text matched (or else the first candidate), the matched card's
   * key, and whether it matched exactly.
   */
  saw(atMs: number, line: string, matchedKey: string | null, exact: boolean): void {
    if (this.since !== null) return;
    const text = normalizeLine(line);
    if (text.replace(/[^\p{L}]/gu, '').length < MIN_LETTERS) return;
    if (matchedKey !== null && matchedKey === this.lastKey) return;
    if (!exact && similarity(text, this.lastName) >= SAME_CARD_SIMILARITY) return;
    this.since = atMs;
  }

  /** The camera stopped (paused, a sheet opened, the app left): drop the time so far, keep the last card. */
  interrupt(): void {
    this.since = null;
  }

  /** A card committed: returns ms since its first new read (null if none was seen), then times the next card. */
  committed(atMs: number, key: string, name: string): number | null {
    const ms = this.since === null ? null : atMs - this.since;
    this.since = null;
    this.lastKey = key;
    this.lastName = normalizeLine(name);
    return ms;
  }

  /** Forgets everything, as at the start of a run. */
  reset(): void {
    this.since = null;
    this.lastKey = null;
    this.lastName = '';
  }
}
