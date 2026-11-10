import { DATA_BASE_URL, Manifest, parseManifest } from './manifest';
import { decideDownload } from './policy';

/** The camera-test build's file, with no `live_slot` setting, is the legacy slot. */
export type Slot = 'a' | 'b' | 'legacy';
export const SLOT_FILES: Record<Slot, string> = {
  a: 'cards-a.sqlite', b: 'cards-b.sqlite', legacy: 'cards-phone.sqlite',
};
export const LIVE_SLOT_KEY = 'live_slot';
export const PART_ZIP = 'download.zip.part';
/** The camera-test build's unzip target, left behind if it died mid-update. */
const LEGACY_PART = 'cards-phone.sqlite.part';
const ZIP_ENTRY = 'cards-phone.sqlite';

export function parseSlot(v: string | null): Slot {
  return v === 'a' || v === 'b' ? v : 'legacy';
}

export function nextSlot(live: Slot): 'a' | 'b' {
  return live === 'a' ? 'b' : 'a';
}

export interface RefreshIO {
  fetchManifest(url: string): Promise<unknown>;
  download(url: string, to: string): Promise<void>;
  sha256(name: string): Promise<string>;
  unzip(zipName: string, entry: string, to: string): Promise<void>;
  readMeta(dbName: string): { price_date: string; phone_format: string };
  setLive(slot: 'a' | 'b'): void; // records the live slot in user.sqlite
  closeLive(): void;
  remove(name: string): void; // no error when missing
}

export type RefreshResult =
  | { status: 'updated'; priceDate: string; live: 'a' | 'b' }
  | { status: 'up-to-date' }
  | { status: 'app-too-old' }
  | { status: 'failed'; error: string };

/** A database file and the WAL files SQLite would replay into a new file of the same name. */
function removeDb(io: RefreshIO, name: string): void {
  io.remove(name);
  io.remove(`${name}-wal`);
  io.remove(`${name}-shm`);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Checks for new data and writes it into the slot that isn't live. The app can die at any step:
 * the live file is never written or removed until another verified file is recorded as live.
 */
export async function refresh(
  io: RefreshIO,
  local: { priceDate: string | null; live: Slot },
): Promise<RefreshResult> {
  const target = nextSlot(local.live);
  const targetFile = SLOT_FILES[target];
  let m: Manifest;
  try {
    // 1. Leftovers from a run that died. Never the live slot's files.
    io.remove(PART_ZIP);
    removeDb(io, targetFile);
    if (local.live !== 'legacy') {
      removeDb(io, SLOT_FILES.legacy);
      io.remove(LEGACY_PART);
    }

    // 2.
    m = parseManifest(await io.fetchManifest(DATA_BASE_URL + 'manifest.json'));
    const decision = decideDownload(m, local.priceDate);
    if (decision === 'app-too-old') return { status: 'app-too-old' };
    if (decision === 'up-to-date') return { status: 'up-to-date' };

    // 3.
    await io.download(DATA_BASE_URL + m.file, PART_ZIP);
    if ((await io.sha256(PART_ZIP)) !== m.sha256) throw new Error('checksum mismatch');

    // 4.
    await io.unzip(PART_ZIP, ZIP_ENTRY, targetFile);

    // 5.
    const meta = io.readMeta(targetFile);
    if (meta.price_date !== m.price_date || Number(meta.phone_format) !== m.phone_format) {
      throw new Error('database does not match manifest');
    }
  } catch (e) {
    try {
      io.remove(targetFile);
      io.remove(PART_ZIP);
    } catch {
      // best effort; step 1 of the next refresh removes them
    }
    return { status: 'failed', error: message(e) };
  }

  // 6. From here the target is complete and verified, so it is never removed: a setLive that throws
  // may still have been written.
  try {
    io.setLive(target);
  } catch (e) {
    try {
      io.remove(PART_ZIP);
    } catch {
      // best effort
    }
    return { status: 'failed', error: message(e) };
  }

  // 7. The update has happened; what's left is tidying, and the next refresh's step 1 redoes it.
  try {
    io.closeLive();
    removeDb(io, SLOT_FILES[local.live]);
  } catch {
    // the old slot is the next target, or legacy, so the next refresh removes it
  }

  // 8.
  try {
    io.remove(PART_ZIP);
  } catch {
    // removed at the next refresh
  }
  return { status: 'updated', priceDate: m.price_date, live: target };
}
