import { Manifest } from '../manifest';
import { decideDownload, downloadPermission, isStale, needsCheck, NetworkKind } from '../policy';

const m: Manifest = {
  phone_format: 1,
  price_date: '2026-11-06',
  file: 'cards-phone-2026-11-06.zip',
  zip_bytes: 10,
  db_bytes: 20,
  sha256: 'b'.repeat(64),
};

describe('needsCheck', () => {
  const now = new Date(2026, 10, 7, 12, 0);
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
  it('is true when never checked', () => expect(needsCheck(null, now)).toBe(true));
  it('is false 23 hours ago', () => expect(needsCheck(ago(23), now)).toBe(false));
  it('is true 25 hours ago', () => expect(needsCheck(ago(25), now)).toBe(true));
});

describe('decideDownload', () => {
  it('downloads a later date', () => expect(decideDownload(m, '2026-11-05')).toBe('download'));
  it('same date is up to date', () => expect(decideDownload(m, '2026-11-06')).toBe('up-to-date'));
  it('earlier manifest is up to date', () => expect(decideDownload(m, '2026-11-07')).toBe('up-to-date'));
  it('newer phone format is app-too-old', () =>
    expect(decideDownload({ ...m, phone_format: 2 }, '2026-11-01')).toBe('app-too-old'));
  it('null local date downloads', () => expect(decideDownload(m, null)).toBe('download'));
});

describe('downloadPermission', () => {
  const cases: [NetworkKind, boolean, string][] = [
    ['wifi', false, 'go'], ['wifi', true, 'go'],
    ['cellular', false, 'ask'], ['cellular', true, 'go'],
    ['none', false, 'offline'], ['none', true, 'offline'],
    ['unknown', false, 'ask'], ['unknown', true, 'ask'],
  ];
  it.each(cases)('%s allowCellular=%s -> %s', (n, c, want) => {
    expect(downloadPermission(n, c)).toBe(want);
  });
});

describe('isStale', () => {
  it('is false late on the third local day', () =>
    expect(isStale('2026-11-04', new Date(2026, 10, 7, 23, 0))).toBe(false));
  it('is true just after local midnight of the fourth day', () =>
    expect(isStale('2026-11-04', new Date(2026, 10, 8, 0, 30))).toBe(true));
});
