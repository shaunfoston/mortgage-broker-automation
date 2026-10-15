/**
 * Decrypt a .moexport file produced by the app's "Secure export".
 * Independent implementation using node:crypto (cross-checks the app's crypto).
 *
 *   npm --workspace server run decrypt-export -- path\to\case.moexport [output-folder]
 *
 * Writes case.json plus any embedded documents/PDFs into the output folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(v as object).filter((k) => (v as any)[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as any)[k])}`).join(',')}}`;
}

export function decryptExportFile(text: string, passphrase: string): any {
  const f = JSON.parse(text);
  if (f.format !== 'mortgage-options-export' || f.version !== 1) throw new Error('Not a Mortgage Options export file');
  const { ciphertext, ...header } = f;
  const key = crypto.pbkdf2Sync(Buffer.from(passphrase.normalize('NFKC'), 'utf8'), Buffer.from(header.kdf.salt, 'base64'), header.kdf.iterations, 32, 'sha256');
  const ct = Buffer.from(ciphertext, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(header.cipher.nonce, 'base64'));
  d.setAAD(Buffer.from(canonicalJson(header), 'utf8'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  try {
    return JSON.parse(Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'));
  } catch {
    throw new Error('Wrong passphrase or the file has been modified');
  }
}

function safeName(s: string) {
  return s.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'file';
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm --workspace server run decrypt-export -- <file.moexport> [output-folder]');
    process.exit(1);
  }
  const outDir = process.argv[3] ?? file.replace(/\.moexport$/i, '') + '-decrypted';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pass = process.env.MO_EXPORT_PASSPHRASE ?? (await new Promise<string>((r) => rl.question('Passphrase: ', r)));
  rl.close();
  const data = decryptExportFile(fs.readFileSync(file, 'utf8'), pass);
  fs.mkdirSync(outDir, { recursive: true });
  const files: { name: string; base64: string }[] = data.files ?? [];
  delete data.files;
  fs.writeFileSync(path.join(outDir, 'case.json'), JSON.stringify(data, null, 2));
  for (const f of files) fs.writeFileSync(path.join(outDir, safeName(f.name)), Buffer.from(f.base64, 'base64'));
  console.log(`Decrypted to ${outDir} (case.json + ${files.length} file(s))`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
