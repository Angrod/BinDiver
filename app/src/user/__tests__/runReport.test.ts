import { CSV_HEADER, runToCsv, summarizeRun } from '../runReport';
import type { Scan, TestRun } from '../store';

const T = Date.parse('2026-11-06T10:00:00.000Z');
const at = (s: number) => new Date(T + s * 1000).toISOString();
const mk = (id: number, sec: number, o: Partial<Scan> = {}): Scan => ({
  id, at: at(sec), runId: 1, oracleIds: ['o'], name: 'Island', source: 'camera',
  rawText: 'Isl', lineUsed: 'Island', match: 'exact', priceDate: '2026-11-04',
  minCents: 25, alerted: false, markedWrong: false, ...o,
});
const run = (stackCount: number): TestRun => ({ id: 1, startedAt: at(0), stoppedAt: null, stackCount });
const scans = [
  mk(1, 0), mk(2, 2, { markedWrong: true }), mk(3, 5, { source: 'search' }), mk(4, 9),
];

describe('summarizeRun', () => {
  it('summarizes', () => {
    expect(summarizeRun(run(3), scans)).toEqual({
      cardsRead: 4, rightReads: 2, readRate: 2 / 3, avgSecondsPerCard: 3,
    });
  });
  it('null rate with zero stack, null average with under 2 scans', () => {
    expect(summarizeRun(run(0), scans).readRate).toBeNull();
    expect(summarizeRun(run(3), [mk(1, 0)]).avgSecondsPerCard).toBeNull();
  });
});

describe('runToCsv', () => {
  it('quotes and times rows', () => {
    const csv = runToCsv([mk(1, 0), mk(2, 2.5, { name: 'Kongming, "Sleeping Dragon"', alerted: true })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1].split(',')[1]).toBe('');
    expect(lines[2]).toContain('2.5,');
    expect(lines[2]).toContain('"Kongming, ""Sleeping Dragon"""');
    expect(lines[2]).toContain(',yes,no');
    expect(csv.endsWith('\n')).toBe(true);
    expect(lines).toHaveLength(4);
  });
});
