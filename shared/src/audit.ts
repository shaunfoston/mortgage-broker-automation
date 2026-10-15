/**
 * Tamper-evident audit trail: every entry stores the SHA-256 of the previous
 * entry, so any edit or deletion in the middle of the log breaks the chain.
 *
 * Audit details must never contain personal data (names, values, notes).
 * That way erasing a client (UK GDPR Art. 17) does not require rewriting
 * the audit log, and the chain stays verifiable.
 */
import { canonicalJson, sha256Hex } from './crypto.ts';

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  caseId: string | null;
  details?: Record<string, string | number | boolean | null>;
}

export interface AuditEntry extends Required<Omit<AuditInput, 'details'>> {
  seq: number;
  id: string;
  ts: string;
  details: Record<string, string | number | boolean | null>;
  prevHash: string;
  hash: string;
}

export function hashAuditEntry(e: Omit<AuditEntry, 'hash'>): string {
  return sha256Hex(
    canonicalJson({
      seq: e.seq,
      id: e.id,
      ts: e.ts,
      actor: e.actor,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      caseId: e.caseId,
      details: e.details,
      prevHash: e.prevHash,
    }),
  );
}

export function buildAuditEntry(prev: { seq: number; hash: string } | null, input: AuditInput, id: string, ts: string): AuditEntry {
  const base = {
    seq: prev ? prev.seq + 1 : 1,
    id,
    ts,
    actor: input.actor,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    caseId: input.caseId,
    details: input.details ?? {},
    prevHash: prev ? prev.hash : GENESIS_HASH,
  };
  return { ...base, hash: hashAuditEntry(base) };
}

export type ChainVerification = { ok: true; count: number } | { ok: false; count: number; brokenAtSeq: number; reason: string };

/** Verify a full chain, ordered by seq ascending. */
export function verifyAuditChain(entries: AuditEntry[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  let prevSeq = 0;
  for (const e of entries) {
    if (e.seq !== prevSeq + 1) return { ok: false, count: entries.length, brokenAtSeq: e.seq, reason: `Missing entry before #${e.seq}` };
    if (e.prevHash !== prevHash) return { ok: false, count: entries.length, brokenAtSeq: e.seq, reason: 'Previous-hash mismatch' };
    const { hash, ...rest } = e;
    if (hashAuditEntry(rest) !== hash) return { ok: false, count: entries.length, brokenAtSeq: e.seq, reason: 'Entry content altered' };
    prevHash = hash;
    prevSeq = e.seq;
  }
  return { ok: true, count: entries.length };
}

/** Plain-English labels for the audit screen and PDF. */
export const AUDIT_LABELS: Record<string, string> = {
  'app.unlocked': 'App unlocked',
  'app.pin_set': 'PIN set',
  'client.created': 'Client created',
  'client.updated': 'Client details updated',
  'client.erased': 'Client erased (right to erasure)',
  'case.created': 'Case created',
  'case.status_changed': 'Case status changed',
  'case.applicants_changed': 'Number of applicants changed',
  'factfind.updated': 'Fact-find section saved',
  'recording.consent_confirmed': 'Recording consent confirmed',
  'recording.saved': 'Meeting recorded',
  'recording.deleted': 'Recording audio deleted',
  'transcription.requested': 'Transcription requested',
  'transcription.completed': 'Transcription completed',
  'transcription.failed': 'Transcription failed',
  'extraction.created': 'AI extraction received',
  'extraction.item_accepted': 'AI value accepted',
  'extraction.item_edited': 'AI value edited and accepted',
  'extraction.item_rejected': 'AI value rejected',
  'consent.signed': 'Consent signed',
  'consent.withdrawn': 'Consent withdrawn',
  'document.added': 'Document added',
  'document.deleted': 'Document deleted',
  'note.added': 'Note added',
  'pdf.generated': 'PDF generated',
  'export.created': 'Encrypted export created',
  'data.demo_seeded': 'Demo data created',
};
