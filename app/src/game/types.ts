import type { CardGroup, SortOrder } from './mtg/types';

export interface CardMatch {
  oracleIds: string[];
  name: string;
  match: 'exact' | 'tolerant' | 'loose' | 'typed';
  isToken: boolean;
  lineUsed: string;
}

export interface Game {
  matchTitle(line: string): CardMatch | null;
  /** Camera reads only, for a line matchTitle missed: a looser match for badly garbled titles. */
  matchTitleLoose(line: string): CardMatch | null;
  find(typed: string): CardMatch | null; // match: 'typed'
  suggest(typed: string, limit: number): string[]; // display names
  lookup(oracleIds: string[], minCents: number, order: SortOrder): CardGroup[];
  setIcon(code: string): string | null;
}
