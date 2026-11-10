import {
  formatCounters, formatElapsed, formatFrameSize, formatLastRead, formatReadRight, formatSecondsPerCard,
  parseStackCount, showsReadAs, versionsLine,
} from '../format';

describe('formatElapsed', () => {
  it('shows minutes and seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(999)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(59 * 60_000 + 59_999)).toBe('59:59');
  });
  it('adds hours from an hour', () => {
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });
  it('shows a negative time as 0:00', () => {
    expect(formatElapsed(-1500)).toBe('0:00');
  });
});

describe('formatReadRight', () => {
  it('shows a one-decimal percentage with its counts', () => {
    expect(formatReadRight(48 / 50, 48, 50)).toBe('96.0% (48 of 50)');
    expect(formatReadRight(46 / 47, 46, 47)).toBe('97.9% (46 of 47)');
  });
  it('shows a dash with no stack count', () => {
    expect(formatReadRight(null, 3, 0)).toBe('—');
  });
});

describe('formatSecondsPerCard', () => {
  it('rounds to one decimal place', () => {
    expect(formatSecondsPerCard(2.345)).toBe('2.3');
    expect(formatSecondsPerCard(3)).toBe('3.0');
    expect(formatSecondsPerCard(null)).toBe('—');
  });
});

describe('labels', () => {
  it('formats the frame size', () => {
    expect(formatFrameSize({ width: 1080, height: 1920 }, 9 / 16)).toBe('Frame 1080×1920');
    expect(formatFrameSize({ width: 1440, height: 1920 }, 3 / 4)).toBe('Frame 1440×1920');
    // A frame whose shape isn't the preview's reads somewhere other than the orange strip.
    expect(formatFrameSize({ width: 1080, height: 1920 }, 3 / 4)).toBe('Frame 1080×1920 · not the preview’s shape');
  });
  it('counts versions', () => {
    expect(versionsLine(0)).toBe('0 versions at $10+');
    expect(versionsLine(1)).toBe('1 version at $10+');
    expect(versionsLine(7)).toBe('7 versions at $10+');
  });
});

describe('parseStackCount', () => {
  it('accepts a positive whole number', () => {
    expect(parseStackCount('50')).toBe(50);
    expect(parseStackCount(' 47 ')).toBe(47);
  });
  it('rejects anything else', () => {
    for (const s of ['', '0', '-3', '4.5', 'abc', '12a', '99999']) expect(parseStackCount(s)).toBeNull();
  });
});

describe('diagnostics', () => {
  it('shows the last candidate and what it matched', () => {
    expect(formatLastRead('fireball xr', 'Fireball')).toBe('“fireball xr” → Fireball');
    expect(formatLastRead('tap add g', null)).toBe('“tap add g” → none');
  });
  it('shows the OCR error and dropped frame counts', () => {
    expect(formatCounters(0, 12, null, null)).toBe('OCR errors 0 · dropped 12');
  });
  it('adds the live zoom and the zoom it should be at', () => {
    expect(formatCounters(0, 12, { actual: 1, target: 2 }, null)).toBe('OCR errors 0 · dropped 12 · zoom 1.0 (want 2.0)');
  });
  it('adds the average time matching takes per read', () => {
    expect(formatCounters(0, 12, { actual: 2, target: 2 }, 3.4)).toBe(
      'OCR errors 0 · dropped 12 · zoom 2.0 (want 2.0) · match 3 ms',
    );
    expect(formatCounters(0, 12, null, 0.2)).toBe('OCR errors 0 · dropped 12 · match 0 ms');
  });
});

describe('showsReadAs', () => {
  it('shows the line read for tolerant and loose matches only', () => {
    expect(showsReadAs('tolerant')).toBe(true);
    expect(showsReadAs('loose')).toBe(true);
    expect(showsReadAs('exact')).toBe(false);
    expect(showsReadAs('typed')).toBe(false);
  });
});
