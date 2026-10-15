import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import { withTransactions, type Db, type SqlParam } from '@mortgage-options/shared/db/adapter.ts';
import { migrate } from '@mortgage-options/shared/db/migrations.ts';
import { toHex } from '@mortgage-options/shared/crypto.ts';

const DB_NAME = 'mortgage-options.db';
const KEY_NAME = 'mo_db_key_v1';
const SECURE = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export interface DbInfo {
  /** true when SQLCipher is active (device builds). Expo Go has no SQLCipher. */
  encrypted: boolean;
  cipherVersion: string | null;
  schemaVersion: number;
}

let raw: SQLite.SQLiteDatabase | null = null;

async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, SECURE);
  if (existing) return existing;
  const key = toHex(ExpoCrypto.getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, SECURE);
  return key;
}

export async function openAppDb(): Promise<{ db: Db; info: DbInfo }> {
  const key = await getOrCreateKey();
  raw = await SQLite.openDatabaseAsync(DB_NAME);
  // Raw-key form: no KDF needed because the key is 256 random bits from the OS keystore.
  await raw.execAsync(`PRAGMA key = "x'${key}'";`);
  let cipherVersion: string | null = null;
  try {
    const r = await raw.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version');
    cipherVersion = r?.cipher_version ?? null;
  } catch {
    cipherVersion = null;
  }
  const d = raw;
  const db = withTransactions({
    exec: (sql) => d.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      const r = await d.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: (sql, params: SqlParam[] = []) => d.getAllAsync(sql, params),
    get: (sql, params: SqlParam[] = []) => d.getFirstAsync(sql, params),
  });
  const schemaVersion = await migrate(db);
  return { db, info: { encrypted: !!cipherVersion, cipherVersion, schemaVersion } };
}

/** Irreversibly delete the local database and its key. */
export async function destroyAppDb(): Promise<void> {
  try {
    await raw?.closeAsync();
  } catch {
    /* ignore */
  }
  raw = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await SecureStore.deleteItemAsync(KEY_NAME, SECURE);
}
