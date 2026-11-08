import type { SortOrder, Version } from './types';

const FINISH_RANK: Record<string, number> = { nonfoil: 0, foil: 1, etched: 2 };
const finishRank = (f: string) => FINISH_RANK[f] ?? 3;

function numberKey(n: string): number {
  const m = /^\d+/.exec(n);
  return m ? Number(m[0]) : Infinity;
}

// Code-point comparison, as Python does (never localeCompare).
const cmp = <T>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);

function tieOrder(a: Version, b: Version): number {
  return (
    cmp(a.releasedAt, b.releasedAt) ||
    cmp(a.setCode, b.setCode) ||
    cmp(numberKey(a.collectorNumber), numberKey(b.collectorNumber)) ||
    cmp(a.collectorNumber, b.collectorNumber) ||
    cmp(finishRank(a.finish), finishRank(b.finish)) ||
    cmp(a.finish, b.finish)
  );
}

export function sortVersions(versions: Version[], order: SortOrder): Version[] {
  const ordered = [...versions].sort(tieOrder);
  if (order === 'newest') {
    ordered.sort((a, b) => cmp(b.releasedAt, a.releasedAt));
  } else if (order === 'price') {
    ordered.sort(
      (a, b) =>
        cmp(a.priceCents === null ? 1 : 0, b.priceCents === null ? 1 : 0) ||
        cmp(b.priceCents ?? 0, a.priceCents ?? 0),
    );
  }
  return ordered;
}
