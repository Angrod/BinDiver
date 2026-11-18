import { sortVersions } from './sort';
import type { SortOrder, Version } from './types';

// Foil and etched look the same at a glance in a bin, so they count as one finish.
const finishClass = (finish: string) => (finish === 'nonfoil' ? 'nonfoil' : 'foil');
const lookKey = (v: Version) => `${v.frameGroup}\u0000${finishClass(v.finish)}`;

/**
 * The cheaper look-alikes: priced versions under the price that share their frame and finish with a
 * version at the price, so a copy in hand could be taken for the valuable one (a white-border Chronicles
 * reprint of a black-border Arabian Nights card, with the same art and symbol). In the list's sort order.
 * Unpriced versions aren't here: they have their own section.
 */
export function findLookAlikes(versions: Version[], minCents: number, order: SortOrder): Version[] {
  const valuable = new Set(
    versions.filter((v) => v.priceCents !== null && v.priceCents >= minCents).map(lookKey),
  );
  return sortVersions(
    versions.filter((v) => v.priceCents !== null && v.priceCents < minCents && valuable.has(lookKey(v))),
    order,
  );
}
