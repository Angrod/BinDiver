import { priceLabel } from '../alert/alert';
import { dollars } from '../game/types';
import type { Version } from '../game/types';

export interface RowView {
  key: string; scryfallId: string; setName: string;
  numberTag: string | null;           // '#57' when another row in the same list has this set name
  finishTag: 'foil' | 'etched' | null;
  price: string;                      // '$13.99' or 'unpriced'
  symbolSet: string | null; noSymbol: boolean;   // noSymbol when symbolSet === 'none'
  lookFor: string; notes: string[]; sameAs: string | null; thisVersion: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function priceText(priceCents: number | null): string {
  return priceCents === null ? 'unpriced' : dollars(priceCents);
}

function plural(n: number): string {
  return `${n} ${n === 1 ? 'version' : 'versions'}`;
}

function sameAsPart(v: Version): string {
  const finish = v.finish === 'nonfoil' ? '' : ` ${v.finish}`;
  return `${v.setName} #${v.collectorNumber}${finish} (${priceText(v.priceCents)})`;
}

function sameAsLine(keys: string[], byKey: Map<string, Version>): string | null {
  const parts: string[] = [];
  for (const k of keys) {
    const v = byKey.get(k);
    if (v !== undefined) parts.push(sameAsPart(v));
  }
  if (parts.length === 0) return null;
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Looks the same as ${joined}. Check a reference image.`;
}

/** `thisVersion` is a Scryfall ID: every finish of that printing is "This version". */
export function rowViews(list: Version[], byKey: Map<string, Version>, thisVersion: string | null): RowView[] {
  const perSet = new Map<string, number>();
  for (const v of list) perSet.set(v.setName, (perSet.get(v.setName) ?? 0) + 1);
  return list.map((v) => ({
    key: v.key,
    scryfallId: v.scryfallId,
    setName: v.setName,
    numberTag: (perSet.get(v.setName) ?? 0) > 1 ? `#${v.collectorNumber}` : null,
    finishTag: v.finish === 'foil' || v.finish === 'etched' ? v.finish : null,
    price: priceText(v.priceCents),
    symbolSet: v.symbolSet,
    noSymbol: v.symbolSet === 'none',
    lookFor: v.lookFor,
    notes: v.notes,
    sameAs: sameAsLine(v.sameAs, byKey),
    thisVersion: thisVersion !== null && v.scryfallId === thisVersion,
  }));
}

export function countLine(qualifying: number, total: number, minCents: number): string {
  return `${qualifying} of ${plural(total)} at ${priceLabel(minCents)}`;
}

export function stickyLine(qualifying: number, unpriced: number, minCents: number): string {
  const base = `${qualifying} at ${priceLabel(minCents)}`;
  return unpriced > 0 ? `${base} · ${unpriced} unpriced` : base;
}

export function nothingLines(total: number, minCents: number): [string, string] {
  return [`Nothing at ${priceLabel(minCents)}`, `0 of ${plural(total)}. No alert.`];
}

export function readAsLine(lineUsed: string): string {
  return `Read as “${lineUsed}”. Not this card? Tap Search.`;
}

export function missingVersionLine(setCode: string, collectorNumber: string, minCents: number): string {
  return `This version (${setCode.toUpperCase()} #${collectorNumber}) isn't at ${priceLabel(minCents)}.`;
}

export function formatPriceDate(priceDate: string, today: Date): string {
  const [y, m, d] = priceDate.split('-').map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  return y === today.getFullYear() ? base : `${base}, ${y}`;
}

const MAX_PRICE_CENTS = 10_000_000;

export function parsePrice(text: string): number | null {
  const m = /^\$?(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (m === null) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return cents >= 1 && cents <= MAX_PRICE_CENTS ? cents : null;
}

export function formatBytes(bytes: number): string {
  return bytes < 1_000_000 ? '<1 MB' : `${Math.round(bytes / 1_000_000)} MB`;
}
