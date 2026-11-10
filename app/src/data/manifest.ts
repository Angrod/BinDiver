export const PHONE_FORMAT = 1;
export const DATA_BASE_URL = 'https://github.com/Angrod/BinDiver/releases/download/data-latest/';

export interface Manifest {
  phone_format: number;
  price_date: string;
  file: string;
  zip_bytes: number;
  db_bytes: number;
  sha256: string;
}

const posInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

export function parseManifest(json: unknown): Manifest {
  if (typeof json !== 'object' || json === null) throw new Error('bad manifest');
  const m = json as Record<string, unknown>;
  if (
    typeof m.phone_format !== 'number' || !Number.isInteger(m.phone_format) ||
    typeof m.price_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.price_date) ||
    typeof m.file !== 'string' || !/^cards-phone-\d{4}-\d{2}-\d{2}\.zip$/.test(m.file) ||
    !posInt(m.zip_bytes) || !posInt(m.db_bytes) ||
    typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(m.sha256)
  ) {
    throw new Error('bad manifest');
  }
  return {
    phone_format: m.phone_format,
    price_date: m.price_date,
    file: m.file,
    zip_bytes: m.zip_bytes,
    db_bytes: m.db_bytes,
    sha256: m.sha256,
  };
}
