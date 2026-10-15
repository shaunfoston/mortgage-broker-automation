/**
 * Minimal async SQL interface. Implemented by:
 *  - app/src/db/expoAdapter.ts  (expo-sqlite, SQLCipher-encrypted on device builds)
 *  - shared/test/nodeAdapter.ts (node:sqlite, used by the automated tests)
 */
export type SqlParam = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number; lastInsertRowId: number }>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | null>;
}

export interface Db extends SqlDriver {
  /** Runs fn inside a transaction. Calls are serialised; nested calls join the outer transaction. */
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

export function withTransactions(driver: SqlDriver): Db {
  let depth = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const db: Db = {
    exec: (s) => driver.exec(s),
    run: (s, p) => driver.run(s, p),
    all: (s, p) => driver.all(s, p),
    get: (s, p) => driver.get(s, p),
    async tx<T>(fn: () => Promise<T>): Promise<T> {
      if (depth > 0) return fn();
      const runIt = async () => {
        depth++;
        await driver.exec('BEGIN IMMEDIATE');
        try {
          const r = await fn();
          await driver.exec('COMMIT');
          return r;
        } catch (e) {
          try {
            await driver.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw e;
        } finally {
          depth--;
        }
      };
      const p = queue.then(runIt, runIt);
      queue = p.catch(() => undefined);
      return p;
    },
  };
  return db;
}
