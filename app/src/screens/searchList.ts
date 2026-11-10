import type { Game, PrintingHit, PrintingRef } from '../game/types';

export type SearchItem =
  | { kind: 'name'; name: string }
  | { kind: 'printing'; hit: PrintingHit }
  | { kind: 'candidate'; printing: PrintingRef };

type SearchGame = Pick<Game, 'searchKind' | 'findPrinting' | 'suggest' | 'numberCandidates'>;

/**
 * What the search sheet lists for this text. A set-and-number hit goes above the name
 * suggestions, never instead of them; number/total lists candidates only.
 */
export function searchList(game: SearchGame, text: string, artistId: number | null): SearchItem[] {
  if (text.trim() === '') return [];
  const kind = game.searchKind(text);
  if (kind === 'number-total') {
    return game
      .numberCandidates(text)
      .filter((p) => artistId === null || p.artistId === artistId)
      .map((printing) => ({ kind: 'candidate', printing }));
  }
  const items: SearchItem[] = [];
  if (kind === 'set-number') {
    const hit = game.findPrinting(text);
    if (hit) items.push({ kind: 'printing', hit });
  }
  for (const name of game.suggest(text, 6)) items.push({ kind: 'name', name });
  return items;
}
