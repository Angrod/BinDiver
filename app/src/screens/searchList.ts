import { NUMBER_CANDIDATE_LIMIT, type Game, type PrintingHit, type PrintingRef, type SearchKind } from '../game/types';

export type SearchItem =
  | { kind: 'name'; name: string }
  | { kind: 'printing'; hit: PrintingHit }
  | { kind: 'candidate'; printing: PrintingRef };

type SearchGame = Pick<Game, 'searchKind' | 'findPrinting' | 'suggest' | 'numberCandidates' | 'artistCards'>;

/**
 * What the search sheet lists for this text and artist. A set-and-number hit goes above the name
 * suggestions, never instead of them; a number (bare or number/total) lists candidates only, narrowed
 * by the artist; the artist alone lists their cards by name. A name search ignores the artist.
 */
export function searchList(game: SearchGame, text: string, artistId: number | null): SearchItem[] {
  if (text.trim() === '') {
    return artistId === null ? [] : game.artistCards(artistId).map((name) => ({ kind: 'name', name }));
  }
  const kind = game.searchKind(text);
  if (kind === 'number-total' || kind === 'number') {
    return game.numberCandidates(text, artistId).map((printing) => ({ kind: 'candidate', printing }));
  }
  const items: SearchItem[] = [];
  if (kind === 'set-number') {
    const hit = game.findPrinting(text);
    if (hit) items.push({ kind: 'printing', hit });
  }
  for (const name of game.suggest(text, 6)) items.push({ kind: 'name', name });
  return items;
}

/**
 * The line under the search list: nothing found for a number or an artist, or a full list of number
 * candidates that the artist would narrow. Null otherwise.
 */
export function searchNote(kind: SearchKind, text: string, count: number, hasArtist: boolean): string | null {
  if (text.trim() === '') return hasArtist && count === 0 ? 'No cards by that artist.' : null;
  if (kind !== 'number' && kind !== 'number-total') return null;
  if (count === 0) return hasArtist ? 'No card with that number by that artist.' : 'No card with that number.';
  if (count >= NUMBER_CANDIDATE_LIMIT && !hasArtist) {
    return `Showing the first ${NUMBER_CANDIDATE_LIMIT}. Add the artist to narrow.`;
  }
  return null;
}
