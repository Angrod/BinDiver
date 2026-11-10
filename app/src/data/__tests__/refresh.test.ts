import { isDeepStrictEqual } from 'util';
import { DATA_BASE_URL, Manifest } from '../manifest';
import {
  LIVE_SLOT_KEY, nextSlot, PART_ZIP, parseSlot, refresh, RefreshIO, RefreshResult, Slot, SLOT_FILES,
} from '../refresh';

const manifest: Manifest = {
  phone_format: 1,
  price_date: '2026-11-06',
  file: 'cards-phone-2026-11-06.zip',
  zip_bytes: 10,
  db_bytes: 20,
  sha256: 'c'.repeat(64),
};
const OLDER = '2026-11-01';

const LEGACY = 'cards-phone.sqlite';
const A = 'cards-a.sqlite';
const B = 'cards-b.sqlite';
const dbFiles = (name: string) => [name, `${name}-wal`, `${name}-shm`];

interface Call { name: keyof RefreshIO; args: unknown[]; ok: boolean }

/** An in-memory file system: file names in `files`, and the slot recorded as live. */
interface Fake {
  io: RefreshIO;
  start: Slot;
  files: Set<string>;
  live: Slot;
  calls: Call[];
}

interface FakeOptions {
  files?: string[]; // default: the starting slot's file
  manifest?: unknown;
  over?: Partial<RefreshIO>;
  /** Makes a call throw before it takes effect, except that a download or unzip leaves a partial file. */
  fail?: (index: number, call: Call) => boolean;
}

/** The file a call writes, if any. */
const written = (c: Call): string | null =>
  c.name === 'download' ? String(c.args[1]) : c.name === 'unzip' ? String(c.args[2]) : null;
const label = (c: Call) => `${c.name}(${c.args.join(',')})`;
const callsTo = (f: Fake, name: keyof RefreshIO) => f.calls.filter((c) => c.name === name);
const namingUser = (f: Fake) =>
  f.calls.flatMap((c) => c.args.map(String)).filter((a) => a.toLowerCase().includes('user'));

function makeFS(start: Slot, opts: FakeOptions = {}): Fake {
  const f: Fake = {
    io: {} as RefreshIO, start, files: new Set(opts.files ?? [SLOT_FILES[start]]), live: start, calls: [],
  };
  const impl: RefreshIO = {
    fetchManifest: async () => opts.manifest ?? manifest,
    download: async (_url, to) => { f.files.add(to); },
    sha256: async () => manifest.sha256,
    unzip: async (_zip, _entry, to) => { f.files.add(to); },
    readMeta: () => ({ price_date: manifest.price_date, phone_format: '1' }),
    setLive: (slot) => { f.live = slot; },
    closeLive: () => {},
    remove: (name) => { f.files.delete(name); },
    ...opts.over,
  };
  for (const name of Object.keys(impl) as Array<keyof RefreshIO>) {
    const run = impl[name] as (...args: unknown[]) => unknown;
    (f.io as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
      const call: Call = { name, args, ok: true };
      f.calls.push(call);
      if (opts.fail?.(f.calls.length - 1, call)) {
        call.ok = false;
        const to = written(call);
        if (to !== null) f.files.add(to);
        throw new Error(`${name} failed`);
      }
      return run(...args);
    };
  }
  return f;
}

const update = (f: Fake, priceDate: string | null = OLDER) => refresh(f.io, { priceDate, live: f.start });
const sorted = (s: Iterable<string>) => [...s].sort();

describe('slots', () => {
  it('names the files and keys', () => {
    expect(SLOT_FILES).toEqual({ a: A, b: B, legacy: LEGACY });
    expect(LIVE_SLOT_KEY).toBe('live_slot');
    expect(PART_ZIP).toBe('download.zip.part');
  });

  it.each<[string | null, Slot]>([
    ['a', 'a'], ['b', 'b'], [null, 'legacy'], ['', 'legacy'], ['legacy', 'legacy'], ['A', 'legacy'], ['c', 'legacy'],
  ])('parseSlot(%p) is %p', (v, slot) => {
    expect(parseSlot(v)).toBe(slot);
  });

  it.each<[Slot, 'a' | 'b']>([['legacy', 'a'], ['a', 'b'], ['b', 'a']])('nextSlot(%p) is %p', (live, next) => {
    expect(nextSlot(live)).toBe(next);
  });
});

describe('refresh', () => {
  it('from legacy, an update downloads into cards-a.sqlite, sets live a, and removes the legacy files', async () => {
    const f = makeFS('legacy', { files: dbFiles(LEGACY) });
    expect(await update(f)).toEqual({ status: 'updated', priceDate: manifest.price_date, live: 'a' });
    expect(f.live).toBe('a');
    expect(sorted(f.files)).toEqual([A]);
    expect(callsTo(f, 'download').map((c) => c.args)).toEqual([[DATA_BASE_URL + manifest.file, PART_ZIP]]);
    expect(callsTo(f, 'unzip').map((c) => c.args)).toEqual([[PART_ZIP, 'cards-phone.sqlite', A]]);
    // Step 1 leaves the live legacy files alone; they go only after slot a is recorded and the old one closed.
    expect(f.calls.slice(0, 5).map(label)).toEqual([
      `remove(${PART_ZIP})`, `remove(${A})`, `remove(${A}-wal)`, `remove(${A}-shm)`,
      `fetchManifest(${DATA_BASE_URL}manifest.json)`,
    ]);
    expect(f.calls.slice(-6).map(label)).toEqual([
      'setLive(a)', 'closeLive()',
      `remove(${LEGACY})`, `remove(${LEGACY}-wal)`, `remove(${LEGACY}-shm)`,
      `remove(${PART_ZIP})`,
    ]);
  });

  it.each<[Slot, 'a' | 'b']>([['a', 'b'], ['b', 'a']])('from %s, an update goes to %s and removes the old file', async (start, next) => {
    const f = makeFS(start, { files: dbFiles(SLOT_FILES[start]) });
    expect(await update(f)).toEqual({ status: 'updated', priceDate: manifest.price_date, live: next });
    expect(f.live).toBe(next);
    expect(callsTo(f, 'unzip').map((c) => c.args[2])).toEqual([SLOT_FILES[next]]);
    expect(sorted(f.files)).toEqual([SLOT_FILES[next]]);
  });

  it('removes leftovers from a run that died before anything else, but never the live files', async () => {
    const leftovers = [PART_ZIP, ...dbFiles(B), ...dbFiles(LEGACY), 'cards-phone.sqlite.part'];
    const f = makeFS('a', { files: [...dbFiles(A), ...leftovers] });
    expect(await update(f, manifest.price_date)).toEqual({ status: 'up-to-date' });
    expect(f.calls.map(label)).toEqual([
      ...leftovers.map((n) => `remove(${n})`),
      `fetchManifest(${DATA_BASE_URL}manifest.json)`,
    ]);
    expect(sorted(f.files)).toEqual(sorted(dbFiles(A)));
    expect(f.live).toBe('a');
  });

  it('a bad checksum leaves live and its files untouched, and removes the target and the zip', async () => {
    const f = makeFS('a', { files: dbFiles(A), over: { sha256: async () => 'd'.repeat(64) } });
    expect(await update(f)).toEqual({ status: 'failed', error: 'checksum mismatch' });
    expect(f.live).toBe('a');
    expect(sorted(f.files)).toEqual(sorted(dbFiles(A)));
    expect(f.calls.flatMap((c) => c.args.map(String)).filter((a) => a.startsWith(A))).toEqual([]);
    expect(f.calls.slice(-2).map(label)).toEqual([`remove(${B})`, `remove(${PART_ZIP})`]);
    for (const n of ['unzip', 'setLive', 'closeLive'] as const) expect(callsTo(f, n)).toEqual([]);
  });

  it.each([
    ['price date', { price_date: '2026-10-01', phone_format: '1' }],
    ['phone format', { price_date: manifest.price_date, phone_format: '2' }],
  ])('a database whose %s does not match the manifest is removed, not made live', async (_what, meta) => {
    const f = makeFS('a', { over: { readMeta: () => meta } });
    expect(await update(f)).toEqual({ status: 'failed', error: 'database does not match manifest' });
    expect(f.live).toBe('a');
    expect(sorted(f.files)).toEqual([A]);
    expect(callsTo(f, 'setLive')).toEqual([]);
  });

  it('a newer phone_format returns app-too-old and downloads nothing', async () => {
    const f = makeFS('a', { manifest: { ...manifest, phone_format: 2 } });
    expect(await update(f)).toEqual({ status: 'app-too-old' });
    for (const n of ['download', 'unzip', 'setLive', 'closeLive'] as const) expect(callsTo(f, n)).toEqual([]);
    expect(f.live).toBe('a');
    expect(sorted(f.files)).toEqual([A]);
  });

  it('a failing remove after setLive still returns updated', async () => {
    const f = makeFS('a', { fail: (_i, c) => c.name === 'remove' && c.args[0] === A });
    expect(await update(f)).toEqual({ status: 'updated', priceDate: manifest.price_date, live: 'b' });
    expect(f.live).toBe('b');
    expect(f.files.has(B)).toBe(true);
    expect(f.files.has(PART_ZIP)).toBe(false);
  });

  it('a setLive that lands and then throws keeps both complete files', async () => {
    const f: Fake = makeFS('a', {
      over: { setLive: (slot) => { f.live = slot; throw new Error('disk I/O error'); } },
    });
    expect(await update(f)).toEqual({ status: 'failed', error: 'disk I/O error' });
    expect(f.live).toBe('b');
    expect(sorted(f.files)).toEqual([A, B]);
    expect(callsTo(f, 'closeLive')).toEqual([]);
  });

  it('no call ever names user.sqlite', async () => {
    const runs: Array<[Fake, string | null]> = [
      [makeFS('legacy'), null],
      [makeFS('a'), OLDER],
      [makeFS('b'), manifest.price_date],
      [makeFS('a', { over: { sha256: async () => 'x' } }), OLDER],
      [makeFS('a', { manifest: { ...manifest, phone_format: 9 } }), OLDER],
      [makeFS('a', { fail: (_i, c) => c.name === 'remove' && c.args[0] === A }), OLDER],
    ];
    for (const [f, priceDate] of runs) {
      await update(f, priceDate);
      expect(f.calls.length).toBeGreaterThan(0);
      expect(namingUser(f)).toEqual([]);
    }
  });
});

describe('a crash at any step', () => {
  /**
   * What is wrong with the slot recorded as live, or null: its file must exist and be complete. The
   * starting slot's file must never have been written in this run; a new slot's file must have been
   * checked by readMeta after its last write and before setLive recorded it.
   */
  function liveProblem(f: Fake): string | null {
    const file = SLOT_FILES[f.live];
    if (!f.files.has(file)) return `live ${file} is missing`;
    const writes = f.calls.flatMap((c, i) => (written(c) === file ? [i] : []));
    if (f.live === f.start) return writes.length === 0 ? null : `live ${file} was written`;
    if (writes.length === 0) return `${file} was made live without being written`;
    const lastWrite = writes[writes.length - 1];
    const setAt = f.calls.map((c) => c.name === 'setLive' && c.ok).lastIndexOf(true);
    const checked = f.calls.some(
      (c, i) => c.name === 'readMeta' && c.ok && c.args[0] === file && i > lastWrite && i < setAt,
    );
    return checked ? null : `${file} was made live without a check after its last write`;
  }

  it.each<Slot>(['legacy', 'a', 'b'])('from %s, the live slot always names a complete file', async (start) => {
    const files = dbFiles(SLOT_FILES[start]);
    const clean = makeFS(start, { files });
    const target = nextSlot(start);
    expect(await update(clean)).toEqual({ status: 'updated', priceDate: manifest.price_date, live: target });
    expect(new Set(clean.calls.map((c) => c.name)).size).toBe(8); // every IO method is in the path
    const setLiveAt = clean.calls.findIndex((c) => c.name === 'setLive');

    const bad: string[] = [];
    for (let k = 0; k < clean.calls.length; k++) {
      // 'throw': call k fails and refresh carries on. 'crash': the app dies at call k, so it and every
      // later call never take effect.
      for (const mode of ['throw', 'crash'] as const) {
        const f = makeFS(start, { files, fail: (i) => (mode === 'throw' ? i === k : i >= k) });
        const r = await update(f);
        const at = `${mode} at call ${k} (${label(clean.calls[k])})`;
        const problem = liveProblem(f);
        if (problem) bad.push(`${at}: ${problem}`);
        if (namingUser(f).length > 0) bad.push(`${at}: named ${namingUser(f).join(', ')}`);
        if (mode === 'throw') {
          const want: RefreshResult = k <= setLiveAt
            ? { status: 'failed', error: `${clean.calls[k].name} failed` }
            : { status: 'updated', priceDate: manifest.price_date, live: target };
          if (!isDeepStrictEqual(r, want)) bad.push(`${at}: got ${JSON.stringify(r)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
