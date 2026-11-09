import type { CardGroup, SortOrder } from './mtg/types';

export interface CardMatch {
  oracleIds: string[];
  name: string;
  match: 'exact' | 'tolerant' | 'typed';
  isToken: boolean;
  lineUsed: string;
}

export interface Game {
  /** A read title line's card; `loose` (camera reads) also accepts badly garbled reads. */
  matchTitle(line: string, loose?: boolean): CardMatch | null;
  find(typed: string): CardMatch | null; // match: 'typed'
  suggest(typed: string, limit: number): string[]; // display names
  lookup(oracleIds: string[], minCents: number, order: SortOrder): CardGroup[];
  setIcon(code: string): string | null;
}
