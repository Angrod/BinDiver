import { openDatabaseSync } from 'expo-sqlite';
import type { Db, SqlValue } from './types';

/** Opens a database in `directory` (a file:// URI) or expo-sqlite's default directory. */
export function openExpoDb(name: string, directory?: string): Db {
  const db = openDatabaseSync(name, {}, directory);
  return {
    all: <T>(sql: string, params: SqlValue[] = []) => db.getAllSync<T>(sql, params),
    get: <T>(sql: string, params: SqlValue[] = []) => db.getFirstSync<T>(sql, params) ?? null,
    run: (sql, params = []) => {
      const r = db.runSync(sql, params);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    exec: (sql) => db.execSync(sql),
    close: () => db.closeSync(),
  };
}
