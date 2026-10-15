import * as SecureStore from 'expo-secure-store';
import { OfflineDemoBackend, ServerBackend, type Backend } from '@mortgage-options/shared/apiClient.ts';
import { uploadFile } from './files.ts';

const SECURE = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const K = { mode: 'mo_backend_mode', url: 'mo_server_url', token: 'mo_server_token', exp: 'mo_server_token_exp', user: 'mo_server_user' };

export type BackendMode = 'offline-demo' | 'server';

export interface BackendSettings {
  mode: BackendMode;
  url: string;
  token: string | null;
  tokenExpiresAt: string | null;
  serverUser: string | null;
}

export async function loadBackendSettings(): Promise<BackendSettings> {
  const [mode, url, token, exp, user] = await Promise.all([K.mode, K.url, K.token, K.exp, K.user].map((k) => SecureStore.getItemAsync(k, SECURE)));
  const expired = !exp || Date.parse(exp) <= Date.now();
  return {
    mode: mode === 'server' ? 'server' : 'offline-demo',
    url: url ?? '',
    token: expired ? null : token,
    tokenExpiresAt: expired ? null : exp,
    serverUser: user,
  };
}

export async function saveBackendSettings(p: Partial<BackendSettings>): Promise<void> {
  const ops: Promise<void>[] = [];
  const put = (k: string, v: string | null | undefined) => {
    if (v === undefined) return;
    ops.push(v === null ? SecureStore.deleteItemAsync(k, SECURE) : SecureStore.setItemAsync(k, v, SECURE));
  };
  put(K.mode, p.mode);
  put(K.url, p.url);
  put(K.token, p.token);
  put(K.exp, p.tokenExpiresAt);
  put(K.user, p.serverUser);
  await Promise.all(ops);
}

export async function clearBackendSettings(): Promise<void> {
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k, SECURE)));
}

const offline = new OfflineDemoBackend();

export function makeBackend(s: BackendSettings): Backend {
  if (s.mode === 'offline-demo') return offline;
  return new ServerBackend(s.url || 'https://invalid.localhost', s.token, fetch, uploadFile);
}
