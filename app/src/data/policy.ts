import { Manifest, PHONE_FORMAT } from './manifest';

export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'unknown';

const DAY_MS = 24 * 3600 * 1000;

export function needsCheck(lastCheckAt: string | null, now: Date): boolean {
  if (lastCheckAt === null) return true;
  const last = Date.parse(lastCheckAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > DAY_MS;
}

export function decideDownload(
  m: Manifest,
  localPriceDate: string | null,
): 'download' | 'up-to-date' | 'app-too-old' {
  if (m.phone_format > PHONE_FORMAT) return 'app-too-old';
  if (localPriceDate === null || m.price_date > localPriceDate) return 'download';
  return 'up-to-date';
}

export function downloadPermission(
  network: NetworkKind,
  allowCellular: boolean,
): 'go' | 'ask' | 'offline' {
  if (network === 'wifi') return 'go';
  if (network === 'cellular') return allowCellular ? 'go' : 'ask';
  if (network === 'none') return 'offline';
  return 'ask';
}

/** More than 3 calendar days old, by the phone's local calendar day. */
export function isStale(priceDate: string, today: Date): boolean {
  const [y, mo, d] = priceDate.split('-').map(Number);
  // Day numbers via UTC arithmetic on calendar fields (immune to DST shifts).
  const priceDay = Date.UTC(y, mo - 1, d) / DAY_MS;
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / DAY_MS;
  return todayDay - priceDay > 3;
}
