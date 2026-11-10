import { DATA_BASE_URL, parseManifest } from './manifest';
import { decideDownload } from './policy';

export const LIVE_DB = 'cards-phone.sqlite';
export const PART_ZIP = 'download.zip.part';
export const PART_DB = 'cards-phone.sqlite.part';

export interface RefreshIO {
  fetchManifest(url: string): Promise<unknown>;
  download(url: string, to: string): Promise<void>;
  sha256(name: string): Promise<string>;
  unzip(zipName: string, entry: string, to: string): Promise<void>;
  readMeta(dbName: string): { price_date: string; phone_format: string };
  closeLive(): void;
  move(from: string, to: string): void; // overwrites
  remove(name: string): void; // no error when missing
}

export type RefreshResult =
  | { status: 'updated'; priceDate: string }
  | { status: 'up-to-date' }
  | { status: 'app-too-old' }
  | { status: 'failed'; error: string };

function cleanParts(io: RefreshIO): void {
  io.remove(PART_ZIP);
  io.remove(PART_DB);
}

export async function refresh(io: RefreshIO, localPriceDate: string | null): Promise<RefreshResult> {
  try {
    cleanParts(io);
    const m = parseManifest(await io.fetchManifest(DATA_BASE_URL + 'manifest.json'));
    const decision = decideDownload(m, localPriceDate);
    if (decision === 'app-too-old') return { status: 'app-too-old' };
    if (decision === 'up-to-date') return { status: 'up-to-date' };

    await io.download(DATA_BASE_URL + m.file, PART_ZIP);
    if ((await io.sha256(PART_ZIP)) !== m.sha256) throw new Error('checksum mismatch');

    await io.unzip(PART_ZIP, 'cards-phone.sqlite', PART_DB);
    const meta = io.readMeta(PART_DB);
    if (meta.price_date !== m.price_date || Number(meta.phone_format) !== m.phone_format) {
      throw new Error('database does not match manifest');
    }

    // Only the verified part file reaches the live name, via the final move.
    io.closeLive();
    io.remove(LIVE_DB + '-wal');
    io.remove(LIVE_DB + '-shm');
    io.move(PART_DB, LIVE_DB);
    io.remove(PART_ZIP);
    return { status: 'updated', priceDate: m.price_date };
  } catch (e) {
    try {
      cleanParts(io);
    } catch {
      // best effort; the next refresh removes leftovers first
    }
    return { status: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}
