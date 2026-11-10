import type { Game } from '../game/types';
import type { UserStore } from './store';

export const BASICS_SEEDED = 'basics_seeded';

/** Marks every basic land not already known, once. Returns how many it marked. */
export function seedBasicsOnce(store: UserStore, game: Pick<Game, 'basicLands'>, at: string): number {
  if (store.getSetting(BASICS_SEEDED) === '1') return 0;
  const basics = game.basicLands();
  if (basics.length === 0) return 0;
  const known = store.knownMarks();
  let marked = 0;
  for (const card of basics) {
    if (known.isKnown(card.oracleId)) continue;
    store.markKnown(card, at);
    marked++;
  }
  store.setSetting(BASICS_SEEDED, '1');
  return marked;
}
