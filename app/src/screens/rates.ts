import { alertRates, maxAlertCents, PRESET_CENTS, type KnownMarks } from '../alert/alert';
import type { Game } from '../game/types';

/**
 * Per preset price, the share of the scanned card names that would give a full alert; null until enough
 * cards have been scanned. Each card is looked up once, at 0 cents (maxAlertCents reads only `qualifying`).
 */
export function presetRates(
  game: Pick<Game, 'lookup'>, cards: Array<{ oracleIds: string[] }>, marks: KnownMarks,
): Map<number, number> | null {
  const maxes = cards.map((c) => maxAlertCents(game.lookup(c.oracleIds, 0, 'oldest'), marks));
  return alertRates(maxes, PRESET_CENTS);
}
