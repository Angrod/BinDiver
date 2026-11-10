import { dollars } from '../game/types';
import type { CardGroup, Version } from '../game/types';

export type AlertKind = 'full' | 'quiet' | 'none';

export interface KnownMarks {
  isKnown(oracleId: string): boolean;
  /** Version keys still alerting for a known card. */
  kept(oracleId: string): ReadonlySet<string>;
}

export const NO_MARKS: KnownMarks = {
  isKnown: () => false,
  kept: () => new Set<string>(),
};

export interface Alert {
  kind: AlertKind;
  known: boolean;
  count: number;
  quietKinds: string[];
  label: string | null;
}

export const PRESET_CENTS: readonly number[] = [200, 500, 1000, 2000, 5000];
export const RATE_MIN_CARDS = 50;

function considered(group: CardGroup, marks: KnownMarks): Version[] {
  if (!marks.isKnown(group.oracleId)) return group.qualifying;
  const kept = marks.kept(group.oracleId);
  return group.qualifying.filter((v) => kept.has(v.key));
}

export function priceLabel(minCents: number): string {
  return `${dollars(minCents).replace(/\.00$/, '')}+`;
}

function joinKinds(kinds: string[]): string {
  const text = kinds.length < 2
    ? kinds.join('')
    : `${kinds.slice(0, -1).join(', ')} or ${kinds[kinds.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function alertFor(
  groups: CardGroup[], minCents: number, marks: KnownMarks, kindOrder: readonly string[],
): Alert {
  const versions = groups.flatMap((g) => considered(g, marks));
  const known = groups.length > 0 && groups.every((g) => marks.isKnown(g.oracleId));
  const count = versions.length;
  const kind: AlertKind = count === 0 ? 'none'
    : versions.some((v) => v.quietKind === '') ? 'full' : 'quiet';
  const present = new Set(versions.map((v) => v.quietKind));
  const quietKinds = kind === 'quiet' ? kindOrder.filter((k) => present.has(k)) : [];
  const plural = count === 1 ? '' : 's';

  let label: string | null;
  if (known) {
    label = kind === 'none' ? 'Known' : `Known · ${count} version${plural} still alert${count === 1 ? 's' : ''}`;
  } else if (kind === 'full') {
    label = 'Worth finding';
  } else if (kind === 'quiet') {
    label = `${joinKinds(quietKinds)} only · ${count} version${plural} at ${priceLabel(minCents)}`;
  } else {
    label = null;
  }
  return { kind, known, count, quietKinds, label };
}

/** Highest price among versions that would give a full alert at a $0 price. */
export function maxAlertCents(groups: CardGroup[], marks: KnownMarks): number | null {
  let max: number | null = null;
  for (const g of groups) {
    for (const v of considered(g, marks)) {
      if (v.quietKind === '' && v.priceCents !== null && (max === null || v.priceCents > max)) max = v.priceCents;
    }
  }
  return max;
}

export function alertRates(
  maxes: Array<number | null>, presets: readonly number[],
): Map<number, number> | null {
  if (maxes.length < RATE_MIN_CARDS) return null;
  return new Map(presets.map((p) => [p, maxes.filter((m) => m !== null && m >= p).length / maxes.length]));
}
