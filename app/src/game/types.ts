import type { CardGroup, SortOrder } from './mtg/types';

export type { CardGroup, SortOrder, Version } from './mtg/types';

export interface KnownCard {
  oracleId: string;
  name: string;
}

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
  /** Camera reads only: whether a read line is the card's footer, so the title strip is over a card's bottom. */
  isFooterText(line: string): boolean;
  find(typed: string): CardMatch | null; // match: 'typed'
  suggest(typed: string, limit: number): string[]; // display names
  lookup(oracleIds: string[], minCents: number, order: SortOrder): CardGroup[];
  setIcon(code: string): string | null;
  /** Quiet kinds in label order: 'old border', 'Secret Lair', 'serialized'. */
  readonly quietKinds: readonly string[];
  /** Whether the card data supports set-and-number and number/total searches. */
  readonly numberSearch: boolean;
  /** The basic lands that start as known. */
  basicLands(): KnownCard[];
}
