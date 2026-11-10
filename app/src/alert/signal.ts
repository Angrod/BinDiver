import type { AlertKind } from './alert';

export type AlertStyle = 'vibration' | 'sound' | 'both' | 'screen';
export type ResultSource = 'camera' | 'search' | 'redraw';

export function signalPlan(
  kind: AlertKind, source: ResultSource, style: AlertStyle,
): { vibrate: boolean; sound: boolean } {
  if (kind !== 'full' || source !== 'camera') return { vibrate: false, sound: false };
  return {
    vibrate: style === 'vibration' || style === 'both',
    sound: style === 'sound' || style === 'both',
  };
}
