import { alertFor, type Alert, type KnownMarks } from '../alert/alert';
import type { CardGroup, CardMatch, Game, SortOrder, Version } from '../game/types';

/** The card the result panel shows: the last one read or picked. */
export interface Shown {
  match: CardMatch;
  /** The Scryfall ID of a version typed by set and number, marked "This version" in any finish. */
  thisVersion: string | null;
}

export interface ResultModel { groups: CardGroup[]; alert: Alert }

/**
 * The shown card's groups and alert at the current price, sort and known marks. Pure: the scan screen
 * calls it once when a card is read or picked (to record and signal) and the panel calls it on every
 * redraw (which never records or signals). A token has no groups and no alert.
 */
export function resultModel(
  game: Game, shown: Shown, minCents: number, order: SortOrder, marks: KnownMarks,
): ResultModel {
  const groups = shown.match.isToken ? [] : game.lookup(shown.match.oracleIds, minCents, order);
  return { groups, alert: alertFor(groups, minCents, marks, game.quietKinds) };
}

/** What a scan records as its alert: 'known' for a known card with nothing still alerting. */
export function scanAlert(model: ResultModel): 'full' | 'quiet' | 'known' | 'none' {
  return model.alert.known && model.alert.kind === 'none' ? 'known' : model.alert.kind;
}

/**
 * The typed version when no row in the list (qualifying or unpriced) has its Scryfall ID, for
 * "This version (… #…) isn't at $10+."; null when there is no typed version or a row has it.
 */
export function missingVersion(groups: CardGroup[], thisVersion: string | null): Version | null {
  if (thisVersion === null) return null;
  const listed = groups.some((g) => [...g.qualifying, ...g.unpriced].some((v) => v.scryfallId === thisVersion));
  if (listed) return null;
  for (const g of groups) {
    for (const v of g.versionsByKey.values()) if (v.scryfallId === thisVersion) return v;
  }
  return null;
}
