import type { Repo } from '@mortgage-options/shared/db/repo.ts';
import { encryptExport } from '@mortgage-options/shared/secureExport.ts';
import { toBase64, utf8 } from '@mortgage-options/shared/crypto.ts';
import { fileBase64, fileExists, writeTextFile } from './files.ts';
import { buildHtml } from './pdf.ts';

const MAX_EMBED_BYTES = 40 * 1024 * 1024;

/**
 * Everything held about a case, plus its documents and the generated HTML
 * documents, encrypted with the broker's passphrase into a .moexport file.
 */
export async function createSecureExport(repo: Repo, caseId: string, passphrase: string, by: string, includeAudio: boolean): Promise<{ uri: string; name: string }> {
  const bundle = await repo.caseBundle(caseId);
  const files: { name: string; base64: string }[] = [];
  let total = 0;
  const add = async (name: string, uri: string) => {
    if (!fileExists(uri)) return;
    const b64 = await fileBase64(uri);
    total += (b64.length * 3) / 4;
    if (total > MAX_EMBED_BYTES) throw new Error('Export is too large (over 40 MB). Export without audio, or remove large documents.');
    files.push({ name, base64: b64 });
  };
  for (const d of bundle.documents) await add(`documents/${d.name}`, d.fileUri);
  if (includeAudio) {
    for (const r of await repo.listRecordings(caseId)) if (r.fileUri) await add(`recordings/${r.id}.m4a`, r.fileUri);
  }
  for (const kind of ['factfind', 'audit'] as const) {
    const html = await buildHtml(repo, caseId, kind, { by });
    files.push({ name: `${kind}.html`, base64: btoaUtf8(html) });
  }
  const text = await encryptExport({ ...bundle, files }, passphrase, new Date().toISOString());
  const name = `${bundle.case.reference}-${new Date().toISOString().slice(0, 10)}.moexport`;
  const uri = await writeTextFile('exports', name, text);
  await repo.audit({ action: 'export.created', entityType: 'case', entityId: caseId, caseId, details: { files: files.length, audio: includeAudio } });
  return { uri, name };
}

function btoaUtf8(s: string): string {
  return toBase64(utf8(s));
}
