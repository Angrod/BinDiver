import { memoryDb } from '../../testing/nodeDb';
import { createUserStore } from '../store';
import { DEFAULT_SETTINGS, readSettings, writeSetting } from '../settings';

describe('settings', () => {
  it('defaults on an empty store', () => {
    expect(readSettings(createUserStore(memoryDb()))).toEqual(DEFAULT_SETTINGS);
  });
  it('round-trips every key', () => {
    const s = createUserStore(memoryDb());
    writeSetting(s, 'minCents', 2000);
    writeSetting(s, 'alertStyle', 'both');
    writeSetting(s, 'shorthand', false);
    writeSetting(s, 'sort', 'price');
    writeSetting(s, 'allowCellular', true);
    writeSetting(s, 'testMode', true);
    expect(readSettings(s)).toEqual({
      minCents: 2000, alertStyle: 'both', shorthand: false, sort: 'price', allowCellular: true, testMode: true,
    });
    expect(s.getSetting('shorthand')).toBe('0');
    expect(s.getSetting('allow_cellular')).toBe('1');
    expect(s.getSetting('min_cents')).toBe('2000');
    writeSetting(s, 'shorthand', true);
    expect(s.getSetting('shorthand')).toBe('1');
  });
  it('falls back on invalid values', () => {
    const s = createUserStore(memoryDb());
    for (const bad of ['abc', '0', '-5', '1.5', '10000001', '']) {
      s.setSetting('min_cents', bad);
      expect(readSettings(s).minCents).toBe(1000);
    }
    s.setSetting('min_cents', '1');
    expect(readSettings(s).minCents).toBe(1);
    s.setSetting('min_cents', '10000000');
    expect(readSettings(s).minCents).toBe(10000000);
    s.setSetting('sort', 'sideways');
    s.setSetting('alert_style', 'loud');
    s.setSetting('shorthand', 'yes');
    s.setSetting('test_mode', '2');
    expect(readSettings(s)).toEqual({ ...DEFAULT_SETTINGS, minCents: 10000000 });
  });
});
