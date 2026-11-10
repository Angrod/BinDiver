// Tests only: a Db backed by Node's built-in node:sqlite.
import { DatabaseSync } from "node:sqlite";
import type { Db, SqlValue } from "../db/types";

function wrap(raw: DatabaseSync): Db {
  return {
    all<T>(sql: string, params: SqlValue[] = []): T[] {
      return raw.prepare(sql).all(...params) as T[];
    },
    get<T>(sql: string, params: SqlValue[] = []): T | null {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    run(sql: string, params: SqlValue[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    exec(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}

export function openNodeDb(path: string): Db {
  return wrap(new DatabaseSync(path));
}

export function memoryDb(): Db {
  return openNodeDb(":memory:");
}
