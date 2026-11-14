import type { AlertStyle } from '../alert/signal';
import type { SortOrder } from '../game/types';
import type { UserStore } from './store';

export interface AppSettings {
  minCents: number; alertStyle: AlertStyle; shorthand: boolean; sort: SortOrder;
  allowCellular: boolean; testMode: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  minCents: 1000, alertStyle: 'vibration', shorthand: true, sort: 'oldest', allowCellular: false, testMode: false,
};

const KEYS: Record<keyof AppSettings, string> = {
  minCents: 'min_cents', alertStyle: 'alert_style', shorthand: 'shorthand', sort: 'sort',
  allowCellular: 'allow_cellular', testMode: 'test_mode',
};
const STYLES: readonly string[] = ['vibration', 'sound', 'both', 'screen'];
const SORTS: readonly string[] = ['oldest', 'newest', 'price'];
const MAX_CENTS = 10_000_000;

const flag = (raw: string | null, fallback: boolean): boolean =>
  raw === '1' ? true : raw === '0' ? false : fallback;

export function readSettings(store: Pick<UserStore, 'getSetting'>): AppSettings {
  const get = (k: keyof AppSettings) => store.getSetting(KEYS[k]);
  const cents = get('minCents');
  const n = cents !== null && /^\d+$/.test(cents) ? Number(cents) : NaN;
  const style = get('alertStyle');
  const sort = get('sort');
  return {
    minCents: Number.isInteger(n) && n >= 1 && n <= MAX_CENTS ? n : DEFAULT_SETTINGS.minCents,
    alertStyle: style !== null && STYLES.includes(style) ? (style as AlertStyle) : DEFAULT_SETTINGS.alertStyle,
    shorthand: flag(get('shorthand'), DEFAULT_SETTINGS.shorthand),
    sort: sort !== null && SORTS.includes(sort) ? (sort as SortOrder) : DEFAULT_SETTINGS.sort,
    allowCellular: flag(get('allowCellular'), DEFAULT_SETTINGS.allowCellular),
    testMode: flag(get('testMode'), DEFAULT_SETTINGS.testMode),
  };
}

export function writeSetting<K extends keyof AppSettings>(
  store: Pick<UserStore, 'setSetting'>, key: K, value: AppSettings[K],
): void {
  const v = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  store.setSetting(KEYS[key], v);
}
