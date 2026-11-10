import type { Db } from '../../db/types';

export interface DataFeatures {
  quietKind: boolean;
  numberSearch: boolean;
}

function hasColumn(db: Db, table: string, column: string): boolean {
  return db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);
}

function hasTable(db: Db, table: string): boolean {
  return db.get("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?", [table]) !== null;
}

/** What this card database offers; an older phone database lacks the newer columns and tables. */
export function dataFeatures(db: Db): DataFeatures {
  return {
    quietKind: hasColumn(db, 'versions', 'quiet_kind'),
    numberSearch:
      hasTable(db, 'artists') && hasColumn(db, 'printings', 'artist_id') && hasColumn(db, 'sets', 'printed_total'),
  };
}
