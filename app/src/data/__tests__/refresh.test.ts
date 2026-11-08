import { Manifest } from '../manifest';
import { LIVE_DB, PART_DB, PART_ZIP, refresh, RefreshIO } from '../refresh';

const manifest: Manifest = {
  phone_format: 1,
  price_date: '2026-11-06',
  file: 'cards-phone-2026-11-06.zip',
  zip_bytes: 10,
  db_bytes: 20,
  sha256: 'c'.repeat(64),
};

function makeIO(over: Partial<RefreshIO> & { m?: unknown } = {}) {
  const calls: string[] = [];
  const io: RefreshIO = {
    fetchManifest: async (u) => { calls.push(`fetchManifest(${u})`); return over.m ?? manifest; },
    download: async (u, to) => { calls.push(`download(${u},${to})`); },
    sha256: async (n) => { calls.push(`sha256(${n})`); return manifest.sha256; },
    unzip: async (z, e, to) => { calls.push(`unzip(${z},${e},${to})`); },
    readMeta: (n) => { calls.push(`readMeta(${n})`); return { price_date: manifest.price_date, phone_format: '1' }; },
    closeLive: () => { calls.push('closeLive'); },
    move: (f, t) => { calls.push(`move(${f},${t})`); },
    remove: (n) => { calls.push(`remove(${n})`); },
    ...over,
  };
  return { io, calls };
}

const has = (calls: string[], p: string) => calls.some((c) => c.startsWith(p));
const BASE = 'https://github.com/Angrod/BinDiver/releases/download/data-latest/';

describe('refresh', () => {
  it('same price date downloads nothing', async () => {
    const { io, calls } = makeIO();
    expect(await refresh(io, '2026-11-06')).toEqual({ status: 'up-to-date' });
    expect(has(calls, 'download')).toBe(false);
    expect(calls.some((c) => c.includes('user'))).toBe(false);
  });

  it('newer phone format keeps the old data', async () => {
    const { io, calls } = makeIO({ m: { ...manifest, phone_format: 2 } });
    expect(await refresh(io, '2026-11-01')).toEqual({ status: 'app-too-old' });
    for (const p of ['download', 'closeLive', 'move']) expect(has(calls, p)).toBe(false);
  });

  it('bad checksum keeps the old data', async () => {
    const { io, calls } = makeIO({ sha256: async () => 'd'.repeat(64) });
    expect(await refresh(io, '2026-11-01')).toEqual({ status: 'failed', error: 'checksum mismatch' });
    expect(has(calls, 'closeLive')).toBe(false);
    expect(has(calls, 'move')).toBe(false);
    const tail = calls.slice(-2);
    expect(tail).toEqual([`remove(${PART_ZIP})`, `remove(${PART_DB})`]);
  });

  it('mismatched database keeps the old data', async () => {
    const { io, calls } = makeIO({
      readMeta: () => ({ price_date: '2026-10-01', phone_format: '1' }),
    });
    expect(await refresh(io, '2026-11-01')).toEqual({
      status: 'failed', error: 'database does not match manifest',
    });
    expect(has(calls, 'move')).toBe(false);
    expect(has(calls, 'closeLive')).toBe(false);
  });

  it('mismatched phone format in the database fails too', async () => {
    const { io, calls } = makeIO({
      readMeta: () => ({ price_date: manifest.price_date, phone_format: '2' }),
    });
    const r = await refresh(io, null);
    expect(r.status).toBe('failed');
    expect(has(calls, 'move')).toBe(false);
  });

  it('download error keeps the old data', async () => {
    const { io, calls } = makeIO({ download: async () => { throw new Error('network down'); } });
    expect(await refresh(io, null)).toEqual({ status: 'failed', error: 'network down' });
    expect(has(calls, 'move')).toBe(false);
    expect(calls.slice(-2)).toEqual([`remove(${PART_ZIP})`, `remove(${PART_DB})`]);
  });

  it('happy path swaps after closing', async () => {
    const { io, calls } = makeIO();
    expect(await refresh(io, '2026-11-01')).toEqual({ status: 'updated', priceDate: '2026-11-06' });
    expect(calls.slice(-5)).toEqual([
      'closeLive',
      `remove(${LIVE_DB}-wal)`,
      `remove(${LIVE_DB}-shm)`,
      `move(${PART_DB},${LIVE_DB})`,
      `remove(${PART_ZIP})`,
    ]);
    expect(calls).toContain(`download(${BASE}${manifest.file},${PART_ZIP})`);
    expect(calls).toContain(`unzip(${PART_ZIP},cards-phone.sqlite,${PART_DB})`);
  });

  it('leftover part files are removed before a new download', async () => {
    const { io, calls } = makeIO();
    await refresh(io, null);
    expect(calls.slice(0, 2)).toEqual([`remove(${PART_ZIP})`, `remove(${PART_DB})`]);
  });

  it('a failure after closing the live database still leaves only verified files', async () => {
    const { io, calls } = makeIO({ move: (f, t) => { calls.push(`move(${f},${t})`); throw new Error('disk full'); } });
    const r = await refresh(io, null);
    expect(r).toEqual({ status: 'failed', error: 'disk full' });
    const touchingLive = calls.filter((c) => c.includes(LIVE_DB) && !c.includes('.part'));
    expect(touchingLive.every((c) => c.includes('-wal') || c.includes('-shm') || c.startsWith('move('))).toBe(true);
    expect(calls.filter((c) => c.startsWith('move('))).toEqual([`move(${PART_DB},${LIVE_DB})`]);
    expect(calls.slice(-2)).toEqual([`remove(${PART_ZIP})`, `remove(${PART_DB})`]);
  });

  it('user data is never touched', async () => {
    const runs = [makeIO(), makeIO({ sha256: async () => 'x' }), makeIO({ m: { ...manifest, phone_format: 9 } })];
    for (const { io, calls } of runs) {
      await refresh(io, null);
      expect(calls.some((c) => c.toLowerCase().includes('user'))).toBe(false);
    }
  });
});
