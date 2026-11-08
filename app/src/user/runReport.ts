import type { Scan, TestRun } from './store';

export interface RunSummary {
  cardsRead: number;
  /** Camera scans not marked wrong. */
  rightReads: number;
  /** Camera scans marked wrong. */
  wrongReads: number;
  /** Stack cards with no right read: max(0, stackCount − rightReads), 0 for an empty stack. */
  missed: number;
  readRate: number | null;
  /**
   * The mean gap between consecutive right camera reads, skipping any gap with a search scan in it;
   * null when there is no such gap.
   */
  avgSecondsPerCard: number | null;
}

export function summarizeRun(run: TestRun, scans: Scan[]): RunSummary {
  const isRight = (s: Scan) => s.source === 'camera' && !s.markedWrong;
  const rightReads = scans.filter(isRight).length;
  const wrongReads = scans.filter((s) => s.source === 'camera' && s.markedWrong).length;

  let total = 0;
  let gaps = 0;
  let prev = -1; // index of the previous right read
  let searchSincePrev = false;
  scans.forEach((s, i) => {
    if (s.source === 'search') searchSincePrev = true;
    if (!isRight(s)) return;
    if (prev >= 0 && !searchSincePrev) {
      total += Date.parse(s.at) - Date.parse(scans[prev].at);
      gaps += 1;
    }
    prev = i;
    searchSincePrev = false;
  });

  return {
    cardsRead: scans.length,
    rightReads,
    wrongReads,
    missed: run.stackCount === 0 ? 0 : Math.max(0, run.stackCount - rightReads),
    readRate: run.stackCount === 0 ? null : rightReads / run.stackCount,
    avgSecondsPerCard: gaps === 0 ? null : total / 1000 / gaps,
  };
}

export const CSV_HEADER =
  'at,seconds_since_previous,source,raw_text,line_used,name,match,price_date,min_cents,alerted,marked_wrong';

function field(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function runToCsv(scans: Scan[]): string {
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  const lines = scans.map((s, i) => {
    const gap = i === 0 ? '' : ((Date.parse(s.at) - Date.parse(scans[i - 1].at)) / 1000).toFixed(1);
    return [s.at, gap, s.source, s.rawText, s.lineUsed, s.name, s.match, s.priceDate,
      String(s.minCents), yn(s.alerted), yn(s.markedWrong)].map(field).join(',');
  });
  return [CSV_HEADER, ...lines].join('\n') + '\n';
}
