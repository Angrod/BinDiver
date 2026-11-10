import { dollars } from './money';
import type { Version } from './types';

const FRAME_ORDER = ['old-1993', 'old-1997', 'modern', 'future', 'm15', 'retro'];
const FRAME_LABELS: Record<string, string> = {
  'old-1993': 'old-border 1993-frame',
  'old-1997': 'old-border 1997-frame',
  modern: 'modern-frame',
  future: 'Future Sight-frame',
  m15: 'M15-frame',
  retro: 'retro-frame',
};
const FINISH_ORDER = ['nonfoil', 'foil'];
const FINISH_WORDS: Record<string, string> = { nonfoil: 'nonfoils', foil: 'foils' };
const MAX_SKIP_ITEMS = 4;
const MIN_SKIP_VERSIONS = 3;
const WHERE_MAX_GROUPS = 2;
// Shares are compared by cross-multiplying: WHERE_MIN_SHARE = 2/5, ALMOST_EVERY = 3/4.

type Order = [number, string, number]; // [frame rank, unknown-frame name, finish rank]

function frameKey(frame: string): [number, string] {
  const i = FRAME_ORDER.indexOf(frame);
  return i >= 0 ? [i, ''] : [FRAME_ORDER.length, frame];
}

function cmpOrder(a: Order, b: Order): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return a[2] - b[2];
}

const frameLabel = (frame: string) => FRAME_LABELS[frame] ?? `${frame}-frame`;

function join(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface Group {
  frame: string; finish: string; total: number; priced: number; qualifying: number;
}

const orderOf = (g: Group): Order => {
  const [r, s] = frameKey(g.frame);
  return [r, s, FINISH_ORDER.indexOf(g.finish)];
};
const skipEligible = (g: Group) => g.qualifying === 0 && g.priced === g.total;
const groupLabel = (g: Group) => `${frameLabel(g.frame)} ${FINISH_WORDS[g.finish]}`;

function buildGroups(versions: Version[], minCents: number): Group[] {
  const groups = new Map<string, Group>();
  for (const v of versions) {
    const frame = v.frameGroup || 'unknown';
    const finish = v.finish === 'nonfoil' ? 'nonfoil' : 'foil';
    const k = `${frame}\u0000${finish}`;
    let g = groups.get(k);
    if (!g) { g = { frame, finish, total: 0, priced: 0, qualifying: 0 }; groups.set(k, g); }
    g.total += 1;
    if (v.priceCents !== null) {
      g.priced += 1;
      if (v.priceCents >= minCents) g.qualifying += 1;
    }
  }
  return [...groups.values()];
}

function where(groups: Group[]): string {
  const ranked = groups
    .filter((g) => g.qualifying >= 1)
    .sort(
      (a, b) =>
        b.qualifying - a.qualifying ||
        // share desc: a.q/a.t > b.q/b.t  <=>  a.q*b.t > b.q*a.t
        b.qualifying * a.total - a.qualifying * b.total ||
        cmpOrder(orderOf(a), orderOf(b)),
    );
  let chosen = ranked.filter((g) => g.qualifying * 5 >= g.total * 2).slice(0, WHERE_MAX_GROUPS);
  if (!chosen.length) chosen = ranked.slice(0, 1);
  return `Value sits in ${join(chosen.map((g) => `${groupLabel(g)} (${g.qualifying} of ${g.total})`))}.`;
}

interface Item { size: number; order: Order; whole: boolean; label: string }

function skip(groups: Group[]): string {
  const byFrame = new Map<string, Group[]>();
  for (const g of groups) {
    const list = byFrame.get(g.frame);
    if (list) list.push(g); else byFrame.set(g.frame, [g]);
  }
  let items: Item[] = [];
  for (const [frame, members] of byFrame) {
    if (members.every(skipEligible)) {
      const [r, s] = frameKey(frame);
      items.push({
        size: members.reduce((n, g) => n + g.total, 0),
        order: [r, s, -1], whole: true, label: frameLabel(frame),
      });
    } else {
      for (const g of members.filter(skipEligible)) {
        items.push({ size: g.total, order: orderOf(g), whole: false, label: groupLabel(g) });
      }
    }
  }
  items = items.filter((i) => i.size >= MIN_SKIP_VERSIONS);
  const kept = items
    .sort((a, b) => b.size - a.size || cmpOrder(a.order, b.order))
    .slice(0, MAX_SKIP_ITEMS);
  if (!kept.length) return '';
  kept.sort((a, b) => cmpOrder(a.order, b.order));
  const whole = kept.filter((i) => i.whole).map((i) => i.label);
  const singles = kept.filter((i) => !i.whole).map((i) => i.label);
  const count = `(0 of ${kept.reduce((n, i) => n + i.size, 0)})`;
  if (whole.length && singles.length) return `Skip ${join(whole)} cards, and ${join(singles)} ${count}.`;
  if (whole.length) return `Skip ${join(whole)} cards ${count}.`;
  return `Skip ${join(singles)} ${count}.`;
}

export function summarize(versions: Version[], minCents: number): string {
  const groups = buildGroups(versions, minCents);
  const n = versions.length;
  const p = groups.reduce((s, g) => s + g.priced, 0);
  const q = groups.reduce((s, g) => s + g.qualifying, 0);
  const threshold = dollars(minCents);
  if (q === 0) {
    const text = `No version is ${threshold}+.`;
    return n > p ? `${text} ${n - p} unpriced.` : text;
  }
  if (q * 4 >= p * 3) return `Almost every version is ${threshold}+ (${q} of ${n}). Check any copy.`;
  return [where(groups), skip(groups)].filter((s) => s).join(' ');
}
