import type { Scan, TestRun } from './store';

export interface RunSummary {
  cardsRead: number; rightReads: number; readRate: number | null; avgSecondsPerCard: number | null;
}

export function summarizeRun(run: TestRun, scans: Scan[]): RunSummary {
  const rightReads = scans.filter((s) => s.source === 'camera' && !s.markedWrong).length;
  let avg: number | null = null;
  if (scans.length >= 2) {
    const span = Date.parse(scans[scans.length - 1].at) - Date.parse(scans[0].at);
    avg = span / 1000 / (scans.length - 1);
  }
  return {
    cardsRead: scans.length,
    rightReads,
    readRate: run.stackCount === 0 ? null : rightReads / run.stackCount,
    avgSecondsPerCard: avg,
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
