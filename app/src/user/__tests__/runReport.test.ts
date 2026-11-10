import { CSV_HEADER, runToCsv, summarizeRun } from '../runReport';
import type { Scan, TestRun } from '../store';

const T = Date.parse('2026-11-06T10:00:00.000Z');
const at = (s: number) => new Date(T + s * 1000).toISOString();
const mk = (id: number, sec: number, o: Partial<Scan> = {}): Scan => ({
  id, at: at(sec), runId: 1, oracleIds: ['o'], name: 'Island', source: 'camera',
  rawText: 'Isl', lineUsed: 'Island', match: 'exact', priceDate: '2026-11-04',
  minCents: 25, alerted: false, alert: '', markedWrong: false, readMs: null, ...o,
});
const run = (stackCount: number): TestRun => ({ id: 1, startedAt: at(0), stoppedAt: null, stackCount });
const scans = [
  mk(1, 0), mk(2, 2, { markedWrong: true }), mk(3, 5, { source: 'search' }), mk(4, 9),
];

describe('summarizeRun', () => {
  it('summarizes', () => {
    // The only right-to-right interval (0 -> 9 s) contains the search, so there is no average.
    expect(summarizeRun(run(3), scans)).toEqual({
      cardsRead: 4, rightReads: 2, wrongReads: 1, missed: 1, readRate: 2 / 3, avgSecondsPerCard: null,
    });
  });
  it('averages the gaps between consecutive right camera reads', () => {
    expect(summarizeRun(run(2), [mk(1, 0), mk(2, 2.5)]).avgSecondsPerCard).toBe(2.5);
  });
  it('skips wrong reads and any gap with a search in it', () => {
    const list = [
      mk(1, 0), mk(2, 1, { markedWrong: true }), mk(3, 3), // 0 -> 3: the wrong read is not a card
      mk(4, 4, { source: 'search' }), mk(5, 10), //            3 -> 10: contains a search, skipped
      mk(6, 15), //                                           10 -> 15
    ];
    expect(summarizeRun(run(10), list).avgSecondsPerCard).toBe(4);
  });
  it('counts no misses past the stack and none with a zero stack', () => {
    expect(summarizeRun(run(1), scans).missed).toBe(0);
    expect(summarizeRun(run(0), scans).missed).toBe(0);
  });
  it('null rate with zero stack, null average with under 2 right camera reads', () => {
    expect(summarizeRun(run(0), scans).readRate).toBeNull();
    expect(summarizeRun(run(3), [mk(1, 0)]).avgSecondsPerCard).toBeNull();
    expect(summarizeRun(run(3), [mk(1, 0), mk(2, 3, { markedWrong: true })]).avgSecondsPerCard).toBeNull();
  });
});

describe('runToCsv', () => {
  it('quotes and times rows', () => {
    const csv = runToCsv([mk(1, 0), mk(2, 2.5, { name: 'Kongming, "Sleeping Dragon"', alerted: true, alert: 'full' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[1].split(',')[1]).toBe('');
    expect(lines[2]).toContain('2.5,');
    expect(lines[2]).toContain('"Kongming, ""Sleeping Dragon"""');
    expect(lines[2]).toContain(',yes,full,no');
    expect(lines[1]).toContain(',no,,no');
    expect(csv.endsWith('\n')).toBe(true);
    expect(lines).toHaveLength(4);
  });
  it('gives each read time in seconds after the gap, blank when unknown', () => {
    expect(CSV_HEADER.startsWith('at,seconds_since_previous,seconds_to_read,source,')).toBe(true);
    const lines = runToCsv([mk(1, 0, { readMs: 1234 }), mk(2, 3, { source: 'search' })]).split('\n');
    expect(lines[1].split(',').slice(1, 3)).toEqual(['', '1.2']);
    expect(lines[2].split(',').slice(1, 3)).toEqual(['3.0', '']);
  });
});
