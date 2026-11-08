import type { Size } from '../scan/geometry';

const DASH = '—';

/** Run time as m:ss, or h:mm:ss from an hour. Negative times show as 0:00. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "Read right": a percentage with one decimal, plus the counts it comes from. */
export function formatReadRight(rate: number | null, right: number, stack: number): string {
  if (rate === null) return DASH;
  return `${(rate * 100).toFixed(1)}% (${right} of ${stack})`;
}

/** "Seconds per card" with one decimal place. */
export function formatSecondsPerCard(seconds: number | null): string {
  return seconds === null ? DASH : seconds.toFixed(1);
}

export function formatFrameSize(size: Size): string {
  return `Frame ${size.width}×${size.height}`;
}

export function versionsLine(n: number): string {
  return `${n} ${n === 1 ? 'version' : 'versions'} at $10+`;
}

/** A scan's local time of day, HH:MM:SS. */
export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** A positive whole number typed into a box, or null. */
export function parseStackCount(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 10000 ? n : null;
}
