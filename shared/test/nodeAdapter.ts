import { DatabaseSync } from 'node:sqlite';
import { withTransactions, type Db, type SqlParam } from '../src/db/adapter.ts';

/** node:sqlite implementation of the app's SQL driver, used by tests. */
export function openNodeDb(path = ':memory:'): Db & { close(): void } {
  const d = new DatabaseSync(path);
  const db = withTransactions({
    async exec(sql) {
      d.exec(sql);
    },
    async run(sql, params: SqlParam[] = []) {
      const r = d.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return d.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: SqlParam[] = []) {
      return (d.prepare(sql).get(...params) as T) ?? null;
    },
  });
  return Object.assign(db, { close: () => d.close() });
}
