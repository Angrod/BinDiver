import { signalPlan, type AlertStyle, type ResultSource } from '../signal';
import type { AlertKind } from '../alert';

const kinds: AlertKind[] = ['full', 'quiet', 'none'];
const sources: ResultSource[] = ['camera', 'search', 'redraw'];
const styles: AlertStyle[] = ['vibration', 'sound', 'both', 'screen'];

const cases = kinds.flatMap((k) => sources.flatMap((s) => styles.map((st) => [k, s, st] as const)));

test.each(cases)('signalPlan(%s, %s, %s)', (kind, source, style) => {
  const on = kind === 'full' && source === 'camera';
  expect(signalPlan(kind, source, style)).toEqual({
    vibrate: on && (style === 'vibration' || style === 'both'),
    sound: on && (style === 'sound' || style === 'both'),
  });
});
