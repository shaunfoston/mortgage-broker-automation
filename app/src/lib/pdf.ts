import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import type { Repo } from '@mortgage-options/shared/db/repo.ts';
import { auditHtml, consentHtml, factFindHtml, meetingSummaryHtml } from '@mortgage-options/shared/pdf/templates.ts';
import { dir, safeFileName } from './files.ts';

export type PdfKind = 'factfind' | 'summary' | 'consent' | 'audit';

const TITLES: Record<PdfKind, string> = { factfind: 'Fact-Find', summary: 'Meeting-Summary', consent: 'Consent-Record', audit: 'Audit-History' };

/** Build the branded HTML for a case document. */
export async function buildHtml(repo: Repo, caseId: string, kind: PdfKind, opts: { recordingId?: string; consentId?: string; by: string }): Promise<string> {
  const caseRec = await repo.getCase(caseId);
  if (!caseRec) throw new Error('Case not found');
  const client = await repo.getClient(caseRec.clientId);
  const generatedAt = new Date().toISOString();
  const base = { client, caseRec, generatedAt, generatedBy: opts.by };
  switch (kind) {
    case 'factfind':
      return factFindHtml(base);
    case 'summary': {
      const recs = await repo.listRecordings(caseId);
      const recording = recs.find((r) => r.id === opts.recordingId) ?? recs.find((r) => r.status === 'transcribed');
      if (!recording) throw new Error('No transcribed meeting yet');
      const extraction = (await repo.listExtractions(caseId)).find((x) => x.recordingId === recording.id) ?? null;
      return meetingSummaryHtml({ ...base, recording, extraction });
    }
    case 'consent': {
      const consents = await repo.listConsents(caseId);
      const consent = consents.find((c) => c.id === opts.consentId) ?? consents[0];
      if (!consent) throw new Error('No consent signed yet');
      return consentHtml({ ...base, consent, verified: repo.verifyConsent(consent) });
    }
    case 'audit': {
      const entries = (await repo.listAudit(caseId, 5000)).reverse();
      const chain = await repo.verifyAudit();
      return auditHtml({ ...base, entries, chainOk: chain.ok });
    }
  }
}

/** Render to a PDF in app storage and return its URI. */
export async function makePdf(repo: Repo, caseId: string, kind: PdfKind, opts: { recordingId?: string; consentId?: string; by: string }): Promise<{ uri: string; name: string }> {
  const html = await buildHtml(repo, caseId, kind, opts);
  const caseRec = (await repo.getCase(caseId))!;
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  const name = safeFileName(`${caseRec.reference}-${TITLES[kind]}.pdf`);
  const dest = new File(dir('exports'), name);
  if (dest.exists) dest.delete();
  await new File(uri).move(dest);
  await repo.audit({ action: 'pdf.generated', entityType: 'case', entityId: caseId, caseId, details: { kind } });
  return { uri: dest.uri, name };
}

export async function shareFile(uri: string, mimeType: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined });
}
