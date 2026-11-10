export type SqlValue = string | number | null;

export interface Db {
  all<T>(sql: string, params?: SqlValue[]): T[];
  get<T>(sql: string, params?: SqlValue[]): T | null; // null when no row
  run(sql: string, params?: SqlValue[]): { lastInsertRowId: number; changes: number };
  exec(sql: string): void;
  close(): void;
}
