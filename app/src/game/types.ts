import type { CardGroup, SortOrder } from './mtg/types';

export type { CardGroup, SortOrder, Version } from './mtg/types';
export { dollars } from './mtg/money';

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

export type SearchKind = 'name' | 'set-number' | 'number-total' | 'number';
/** The most candidates a number search lists. */
export const NUMBER_CANDIDATE_LIMIT = 50;

export interface PrintingRef {
  oracleId: string; name: string; scryfallId: string; setCode: string; setName: string;
  collectorNumber: string; releasedAt: string; artistId: number | null; artist: string | null;
  symbolSet: string | null;
}

export interface PrintingHit { match: CardMatch; printing: PrintingRef } // match.match is 'typed'

export interface ArtistOption { id: number; name: string }

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
  /** What kind of search the text could be; 'name' when number searches are off. */
  searchKind(text: string): SearchKind;
  /** The printing a set-and-number text names, or null. */
  findPrinting(text: string): PrintingHit | null;
  /**
   * Number/total or a bare number: printings from 1998 on with that number (for number/total, in a set
   * of that printed total), by that artist when one is given, oldest first. At most NUMBER_CANDIDATE_LIMIT.
   */
  numberCandidates(text: string, artistId: number | null): PrintingRef[];
  /** Artists whose name, or a word of it, starts with the typed text, at most `limit`, A to Z. */
  artistOptions(typed: string, limit: number): ArtistOption[];
  /** The names of an artist's cards, A to Z, once each. */
  artistCards(artistId: number): string[];
  /** The basic lands that start as known. */
  basicLands(): KnownCard[];
}
