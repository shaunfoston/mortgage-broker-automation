import { Directory, File, Paths, UploadType } from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha2.js';
import { toHex } from '@mortgage-options/shared/crypto.ts';

/** App-private folders (inside the sandbox; covered by OS file encryption). */
export function dir(name: 'recordings' | 'documents' | 'exports'): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'file';
}

/** Move a just-finished recording out of the cache into permanent app storage. */
export async function keepRecording(tempUri: string, id: string): Promise<{ uri: string; size: number | null }> {
  const src = new File(tempUri);
  const ext = src.extension || '.m4a';
  const dest = new File(dir('recordings'), `${id}${ext}`);
  await src.move(dest);
  return { uri: dest.uri, size: dest.exists ? dest.size : null };
}

export async function importDocument(sourceUri: string, name: string): Promise<{ uri: string; size: number; sha256: string }> {
  const src = new File(sourceUri);
  const dest = new File(dir('documents'), `${Date.now()}-${safeFileName(name)}`);
  await src.copy(dest);
  const bytes = await dest.bytes();
  return { uri: dest.uri, size: bytes.length, sha256: toHex(sha256(bytes)) };
}

export function deleteFileQuietly(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* already gone */
  }
}

export async function fileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

export function fileExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Binary upload used by the server backend (streams from disk natively). */
export async function uploadFile(url: string, fileUri: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const r = await new File(fileUri).upload(url, { httpMethod: 'POST', uploadType: UploadType.BINARY_CONTENT, headers });
  return { status: r.status, body: r.body };
}

export async function writeTextFile(folder: 'exports', name: string, text: string): Promise<string> {
  const f = new File(dir(folder), safeFileName(name));
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  return f.uri;
}

/** Remove every file the app created (used by "Delete all data"). */
export function wipeAllFiles(): void {
  for (const n of ['recordings', 'documents', 'exports'] as const) {
    try {
      const d = new Directory(Paths.document, n);
      if (d.exists) d.delete();
    } catch {
      /* ignore */
    }
  }
}
