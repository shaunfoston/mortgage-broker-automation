import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { hashPin, verifyPin } from '@mortgage-options/shared/crypto.ts';

const SECURE = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const K = { pin: 'mo_pin_v1', fails: 'mo_pin_fails', lockedUntil: 'mo_pin_locked_until', bio: 'mo_biometrics', timeout: 'mo_lock_timeout_s' };

// PIN hash lives in the hardware-backed keystore; KDF cost is kept modest so unlock stays fast on older phones.
const PIN_ITERATIONS = 20_000;

export function pinProblems(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'Use exactly 6 digits';
  if (/^(\d)\1{5}$/.test(pin)) return 'Avoid repeated digits';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Avoid sequences like 123456';
  return null;
}

export async function hasPin(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(K.pin, SECURE));
}

export async function setPin(pin: string): Promise<void> {
  const problem = pinProblems(pin);
  if (problem) throw new Error(problem);
  const h = await hashPin(pin, undefined, PIN_ITERATIONS);
  await SecureStore.setItemAsync(K.pin, JSON.stringify(h), SECURE);
  await SecureStore.deleteItemAsync(K.fails, SECURE);
  await SecureStore.deleteItemAsync(K.lockedUntil, SECURE);
}

export type UnlockResult = { ok: true } | { ok: false; waitSeconds: number; attemptsLeft: number | null };

/** Escalating delay: 5 failures → 30 s, 8 → 5 min, 10+ → 30 min. */
function delayFor(fails: number): number {
  if (fails >= 10) return 1800;
  if (fails >= 8) return 300;
  if (fails >= 5) return 30;
  return 0;
}

export async function lockoutRemaining(): Promise<number> {
  const until = Number((await SecureStore.getItemAsync(K.lockedUntil, SECURE)) ?? 0);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export async function tryPin(pin: string): Promise<UnlockResult> {
  const wait = await lockoutRemaining();
  if (wait > 0) return { ok: false, waitSeconds: wait, attemptsLeft: null };
  const stored = await SecureStore.getItemAsync(K.pin, SECURE);
  if (!stored) return { ok: false, waitSeconds: 0, attemptsLeft: null };
  if (await verifyPin(pin, JSON.parse(stored))) {
    await SecureStore.deleteItemAsync(K.fails, SECURE);
    return { ok: true };
  }
  const fails = Number((await SecureStore.getItemAsync(K.fails, SECURE)) ?? 0) + 1;
  await SecureStore.setItemAsync(K.fails, String(fails), SECURE);
  const d = delayFor(fails);
  if (d) await SecureStore.setItemAsync(K.lockedUntil, String(Date.now() + d * 1000), SECURE);
  return { ok: false, waitSeconds: d, attemptsLeft: d ? 0 : Math.max(0, 5 - fails) };
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function biometricsEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K.bio, SECURE)) === '1';
}

export async function setBiometricsEnabled(on: boolean): Promise<void> {
  if (on) await SecureStore.setItemAsync(K.bio, '1', SECURE);
  else await SecureStore.deleteItemAsync(K.bio, SECURE);
}

export async function unlockWithBiometrics(): Promise<boolean> {
  if (!(await biometricsEnabled()) || !(await biometricsAvailable())) return false;
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Mortgage Options', disableDeviceFallback: true, cancelLabel: 'Use PIN' });
  return r.success;
}

/** Seconds in background before the app locks. Default 60. */
export async function getLockTimeout(): Promise<number> {
  const raw = await SecureStore.getItemAsync(K.timeout, SECURE);
  const v = Number(raw);
  return raw !== null && Number.isFinite(v) && v >= 0 ? v : 60;
}

export async function setLockTimeout(seconds: number): Promise<void> {
  await SecureStore.setItemAsync(K.timeout, String(seconds), SECURE);
}

export async function clearLockData(): Promise<void> {
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k, SECURE)));
}
