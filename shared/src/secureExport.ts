/**
 * Encrypted case export (.moexport) — AES-256-GCM, key from passphrase via
 * PBKDF2-SHA256. The header is bound as additional authenticated data so it
 * cannot be altered. Decrypt on a PC with: npm --workspace server run decrypt-export -- <file>
 */
import { aesGcmDecrypt, aesGcmEncrypt, canonicalJson, deriveKey, fromBase64, fromUtf8, randomBytes, toBase64, utf8 } from './crypto.ts';

export const EXPORT_FORMAT = 'mortgage-options-export';
export const EXPORT_ITERATIONS = 210_000;
export const MIN_PASSPHRASE_LENGTH = 12;

export interface ExportHeader {
  format: typeof EXPORT_FORMAT;
  version: 1;
  createdAt: string;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: { name: 'AES-256-GCM'; nonce: string };
}

export interface ExportFile extends ExportHeader {
  ciphertext: string;
}

export function passphraseProblems(p: string): string[] {
  const issues: string[] = [];
  if (p.length < MIN_PASSPHRASE_LENGTH) issues.push(`Use at least ${MIN_PASSPHRASE_LENGTH} characters`);
  if (/^(.)\1+$/.test(p)) issues.push('Avoid repeated characters');
  return issues;
}

export async function encryptExport(payload: unknown, passphrase: string, createdAt: string, iterations = EXPORT_ITERATIONS): Promise<string> {
  const problems = passphraseProblems(passphrase);
  if (problems.length) throw new Error(problems.join('; '));
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const header: ExportHeader = {
    format: EXPORT_FORMAT,
    version: 1,
    createdAt,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM', nonce: toBase64(nonce) },
  };
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = aesGcmEncrypt(key, nonce, utf8(JSON.stringify(payload)), utf8(canonicalJson(header)));
  const file: ExportFile = { ...header, ciphertext: toBase64(ct) };
  return JSON.stringify(file);
}

export async function decryptExport<T = unknown>(fileText: string, passphrase: string): Promise<T> {
  const f = JSON.parse(fileText) as ExportFile;
  if (f.format !== EXPORT_FORMAT || f.version !== 1) throw new Error('Not a Mortgage Options export');
  const { ciphertext, ...header } = f;
  const key = await deriveKey(passphrase, fromBase64(header.kdf.salt), header.kdf.iterations);
  let pt: Uint8Array;
  try {
    pt = aesGcmDecrypt(key, fromBase64(header.cipher.nonce), fromBase64(ciphertext), utf8(canonicalJson(header)));
  } catch {
    throw new Error('Wrong passphrase or file has been modified');
  }
  return JSON.parse(fromUtf8(pt)) as T;
}
