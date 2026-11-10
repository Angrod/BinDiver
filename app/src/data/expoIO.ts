import { digest, CryptoDigestAlgorithm } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import { unzipSync } from 'fflate';
import { openExpoDb } from '../db/expoDb';
import type { RefreshIO } from './refresh';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * File operations for `refresh`, all inside `dir` (the cards directory). `setLive` records the live
 * slot in user.sqlite, and `closeLive` closes the open card database.
 */
export function createExpoRefreshIO(
  dir: Directory, closeLive: () => void, setLive: (slot: 'a' | 'b') => void,
): RefreshIO {
  const file = (name: string) => new File(dir, name);
  return {
    async fetchManifest(url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      return res.json();
    },
    async download(url, to) {
      await File.downloadFileAsync(url, file(to), { idempotent: true });
    },
    async sha256(name) {
      return toHex(await digest(CryptoDigestAlgorithm.SHA256, await file(name).bytes()));
    },
    async unzip(zipName, entry, to) {
      const files = unzipSync(await file(zipName).bytes(), { filter: (f) => f.name === entry });
      const bytes = files[entry];
      if (!bytes) throw new Error(`${entry} missing from download`);
      const out = file(to);
      if (!out.exists) out.create();
      await out.write(bytes);
    },
    readMeta(dbName) {
      const db = openExpoDb(dbName, dir.uri);
      try {
        const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM meta');
        const m = new Map(rows.map((r) => [r.key, r.value]));
        return {
          price_date: m.get('price_date') ?? '',
          phone_format: m.get('phone_format') ?? '',
        };
      } finally {
        db.close();
      }
    },
    setLive,
    closeLive,
    remove(name) {
      const f = file(name);
      if (f.exists) f.delete();
    },
  };
}
