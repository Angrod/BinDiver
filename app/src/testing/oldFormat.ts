// Tests only: a copy of a phone database cut back to the older camera-test format.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Db } from '../db/types';
import { openNodeDb } from './nodeDb';

export function oldFormatCopy(src: string): Db {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bindiver-old-'));
  const dest = path.join(dir, 'old.sqlite');
  const from = openNodeDb(src);
  from.run('VACUUM INTO ?', [dest]);
  from.close();
  const db = openNodeDb(dest);
  db.exec(`ALTER TABLE versions DROP COLUMN quiet_kind;
ALTER TABLE sets DROP COLUMN printed_total;
ALTER TABLE printings DROP COLUMN artist_id;
DROP TABLE artists;`);
  return db;
}
