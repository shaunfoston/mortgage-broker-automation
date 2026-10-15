/**
 * Portable crypto helpers (pure JS via audited @noble libraries) so the same
 * code runs in Hermes (React Native) and Node.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { gcm } from '@noble/ciphers/aes.js';

export type RandomBytes = (n: number) => Uint8Array;

/** Default random source: WebCrypto getRandomValues (Node, browsers, Expo with polyfill). */
export const defaultRandomBytes: RandomBytes = (n) => {
  const c = (globalThis as any).crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('No secure random source available');
  const b = new Uint8Array(n);
  c.getRandomValues(b);
  return b;
};

let randomSource: RandomBytes = defaultRandomBytes;
export function setRandomSource(fn: RandomBytes): void {
  randomSource = fn;
}
export function randomBytes(n: number): Uint8Array {
  return randomSource(n);
}

const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s: string): Uint8Array => enc.encode(s);
export const fromUtf8 = (b: Uint8Array): string => dec.decode(b);

export function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

export function sha256Hex(data: string | Uint8Array): string {
  return toHex(sha256(typeof data === 'string' ? utf8(data) : data));
}

/** RFC 4122 v4 UUID. */
export function uuid(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Deterministic JSON (sorted keys) for hashing. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v as object)
    .filter((k) => (v as any)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as any)[k])}`).join(',')}}`;
}

// ─────────────────────────────── base64 ───────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, '');
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('Invalid base64');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean[i]];
    const b = B64_LOOKUP[clean[i + 1]];
    const c = B64_LOOKUP[clean[i + 2]] ?? 0;
    const d = B64_LOOKUP[clean[i + 3]] ?? 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ─────────────────────────── PIN / passphrase KDF ───────────────────────────

export const PIN_KDF_ITERATIONS = 120_000;

export async function hashPin(pin: string, saltB64?: string, iterations = PIN_KDF_ITERATIONS) {
  const salt = saltB64 ? fromBase64(saltB64) : randomBytes(16);
  const key = await pbkdf2Async(sha256, utf8(pin), salt, { c: iterations, dkLen: 32, asyncTick: 20 });
  return { hash: toBase64(key), salt: toBase64(salt), iterations };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyPin(pin: string, stored: { hash: string; salt: string; iterations: number }): Promise<boolean> {
  const h = await hashPin(pin, stored.salt, stored.iterations);
  return constantTimeEqual(h.hash, stored.hash);
}

// ─────────────────────────── AES-256-GCM helpers ───────────────────────────

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8(passphrase.normalize('NFKC')), salt, { c: iterations, dkLen: 32, asyncTick: 20 });
}

export function aesGcmEncrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Uint8Array {
  return gcm(key, nonce, aad).encrypt(plaintext);
}

export function aesGcmDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad?: Uint8Array): Uint8Array {
  return gcm(key, nonce, aad).decrypt(ciphertext);
}
