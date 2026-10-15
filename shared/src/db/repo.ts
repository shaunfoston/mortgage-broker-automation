/**
 * All persistence for the app. Every state change writes an audit entry in
 * the same transaction. Audit details never contain personal data.
 */
import type { Db, SqlParam } from './adapter.ts';
import { buildAuditEntry, verifyAuditChain, type AuditEntry, type AuditInput, type ChainVerification } from '../audit.ts';
import { uuid } from '../crypto.ts';
import {
  CONSENT_VERSION,
  consentRecordHash,
  consentTextHash,
  signatureHash,
  validateConsentAnswers,
  type ConsentRecordCore,
} from '../consent.ts';
import { RECORDING_DISCLOSURE_VERSION } from '../consent.ts';
import {
  coerceRow,
  emptyFactFind,
  getList,
  getValue,
  parseFactFind,
  setList,
  setListNone,
  setValue,
  type FactFind,
  type ProvenanceMap,
  type Row,
} from '../factfind/model.ts';
import { getSection, parsePath, type Owner } from '../factfind/schema.ts';
import { coerceValue, type FieldValue } from '../factfind/values.ts';
import type { ExtractionProposal, MeetingSummary, Rejected } from '../extraction.ts';

export const CASE_STATUSES = [
  'Fact-find',
  'Meeting held',
  'AI review',
  'Consent signed',
  'Research',
  'Application submitted',
  'Offer issued',
  'Completed',
  'Not proceeding',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Fixed list so no free text (possible personal data) enters the audit log. */
export const ERASURE_REASONS = ['Client request', 'Retention period ended', 'Created in error', 'Demo data'] as const;
export type ErasureReason = (typeof ERASURE_REASONS)[number];

export const DOCUMENT_CATEGORIES = [
  'Photo ID',
  'Proof of address',
  'Payslips',
  'P60 / tax documents',
  'Bank statements',
  'SA302 / tax overview',
  'Accounts',
  'Gift letter',
  'Mortgage statement',
  'Property details',
  'Other',
] as const;

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientListItem extends Client {
  caseCount: number;
  lastActivity: string;
}

export interface CaseRecord {
  id: string;
  clientId: string;
  reference: string;
  purpose: string | null;
  status: CaseStatus;
  numApplicants: 1 | 2;
  factFind: FactFind;
  provenance: ProvenanceMap;
  createdAt: string;
  updatedAt: string;
}

export type RecordingStatus = 'recorded' | 'uploading' | 'processing' | 'transcribed' | 'failed';

export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface Recording {
  id: string;
  caseId: string;
  fileUri: string | null;
  mime: string | null;
  durationMs: number | null;
  sizeBytes: number | null;
  consentConfirmedAt: string;
  consentConfirmedBy: string;
  disclosureVersion: string;
  status: RecordingStatus;
  remoteJobId: string | null;
  transcript: string | null;
  utterances: Utterance[];
  provider: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type Decision = 'pending' | 'accepted' | 'edited' | 'rejected';

export interface ExtractionItem {
  id: string;
  extractionId: string;
  ord: number;
  kind: 'field' | 'list_item';
  path: string;
  proposed: FieldValue | Row;
  rawValue: string | null;
  confidence: number;
  evidence: string | null;
  decision: Decision;
  finalValue: FieldValue | Row | null;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface Extraction {
  id: string;
  caseId: string;
  recordingId: string | null;
  model: string | null;
  promptVersion: string | null;
  summary: MeetingSummary;
  rejected: Rejected[];
  status: 'pending_review' | 'reviewed';
  createdAt: string;
  reviewedAt: string | null;
  items: ExtractionItem[];
}

export interface ConsentRecord extends ConsentRecordCore {
  signature: string;
  recordHash: string;
  withdrawnAt: string | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  caseId: string;
  category: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  fileUri: string;
  sha256: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  caseId: string;
  body: string;
  author: string;
  createdAt: string;
}

export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

export interface RepoContext {
  actor: () => string;
  now?: () => Date;
}

const j = (v: unknown) => JSON.stringify(v);
function pj<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export class Repo {
  db: Db;
  ctx: RepoContext;
  constructor(db: Db, ctx: RepoContext) {
    this.db = db;
    this.ctx = ctx;
  }

  private now(): string {
    return (this.ctx.now ? this.ctx.now() : new Date()).toISOString();
  }

  // ─────────────────────────────── audit ───────────────────────────────

  async audit(input: Omit<AuditInput, 'actor'> & { actor?: string }): Promise<AuditEntry> {
    return this.db.tx(async () => {
      const prev = await this.db.get<{ seq: number; hash: string }>('SELECT seq, hash FROM audit_log ORDER BY seq DESC LIMIT 1');
      const e = buildAuditEntry(prev, { ...input, actor: input.actor ?? this.ctx.actor() }, uuid(), this.now());
      await this.db.run(
        `INSERT INTO audit_log(seq,id,ts,actor,action,entity_type,entity_id,case_id,details,prev_hash,hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [e.seq, e.id, e.ts, e.actor, e.action, e.entityType, e.entityId, e.caseId, j(e.details), e.prevHash, e.hash],
      );
      return e;
    });
  }

  async listAudit(caseId?: string, limit = 500): Promise<AuditEntry[]> {
    const rows = caseId
      ? await this.db.all<any>('SELECT * FROM audit_log WHERE case_id = ? ORDER BY seq DESC LIMIT ?', [caseId, limit])
      : await this.db.all<any>('SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?', [limit]);
    return rows.map(mapAudit);
  }

  async verifyAudit(): Promise<ChainVerification> {
    const rows = await this.db.all<any>('SELECT * FROM audit_log ORDER BY seq ASC');
    return verifyAuditChain(rows.map(mapAudit));
  }

  // ─────────────────────────────── settings ───────────────────────────────

  async getSetting(key: string): Promise<string | null> {
    const r = await this.db.get<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key]);
    return r?.value ?? null;
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    await this.db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  // ─────────────────────────────── clients ───────────────────────────────

  async createClient(input: { firstName: string; lastName: string; email?: string; phone?: string; isDemo?: boolean }): Promise<Client> {
    const errors: Record<string, string> = {};
    const firstName = (input.firstName ?? '').trim();
    const lastName = (input.lastName ?? '').trim();
    if (!firstName) errors.firstName = 'Required';
    if (!lastName) errors.lastName = 'Required';
    let email: string | null = null;
    let phone: string | null = null;
    if (input.email?.trim()) {
      const r = coerceValue({ key: 'email', label: 'Email', type: 'email' }, input.email);
      if (!r.ok) errors.email = r.error;
      else email = r.value as string;
    }
    if (input.phone?.trim()) {
      const r = coerceValue({ key: 'phone', label: 'Phone', type: 'phone' }, input.phone);
      if (!r.ok) errors.phone = r.error;
      else phone = r.value as string;
    }
    if (Object.keys(errors).length) throw new ValidationError('Please correct the highlighted fields', errors);
    const now = this.now();
    const c: Client = { id: uuid(), firstName, lastName, email, phone, isDemo: !!input.isDemo, createdAt: now, updatedAt: now };
    await this.db.tx(async () => {
      await this.db.run('INSERT INTO clients(id,first_name,last_name,email,phone,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', [
        c.id, c.firstName, c.lastName, c.email, c.phone, c.isDemo ? 1 : 0, now, now,
      ]);
      await this.audit({ action: 'client.created', entityType: 'client', entityId: c.id, caseId: null, details: { demo: c.isDemo } });
    });
    return c;
  }

  async getClient(id: string): Promise<Client | null> {
    const r = await this.db.get<any>('SELECT * FROM clients WHERE id = ?', [id]);
    return r ? mapClient(r) : null;
  }

  async listClients(search = ''): Promise<ClientListItem[]> {
    const q = `%${search.trim().toLowerCase()}%`;
    const rows = await this.db.all<any>(
      `SELECT c.*, COUNT(k.id) AS case_count, MAX(COALESCE(k.updated_at, c.updated_at)) AS last_activity
       FROM clients c LEFT JOIN cases k ON k.client_id = c.id
       WHERE lower(c.first_name || ' ' || c.last_name || ' ' || COALESCE(c.email,'') || ' ' || COALESCE(k.reference,'')) LIKE ?
       GROUP BY c.id ORDER BY last_activity DESC`,
      [q],
    );
    return rows.map((r) => ({ ...mapClient(r), caseCount: Number(r.case_count), lastActivity: r.last_activity ?? r.updated_at }));
  }

  async updateClient(id: string, patch: { firstName?: string; lastName?: string; email?: string | null; phone?: string | null }): Promise<Client> {
    const c = await this.getClient(id);
    if (!c) throw new ValidationError('Client not found');
    const next = { ...c, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Client;
    if (!next.firstName?.trim() || !next.lastName?.trim()) throw new ValidationError('Name is required');
    const now = this.now();
    await this.db.tx(async () => {
      await this.db.run('UPDATE clients SET first_name=?, last_name=?, email=?, phone=?, updated_at=? WHERE id=?', [
        next.firstName.trim(), next.lastName.trim(), next.email ?? null, next.phone ?? null, now, id,
      ]);
      await this.audit({ action: 'client.updated', entityType: 'client', entityId: id, caseId: null, details: { fields: Object.keys(patch).join(',') } });
    });
    return { ...next, updatedAt: now };
  }

  /**
   * Right to erasure: removes the client and every case, recording, transcript,
   * extraction, consent, document and note. Returns local file URIs so the
   * caller can delete the files. Audit entries (which hold no personal data) remain.
   */
  async eraseClient(id: string, reason: ErasureReason): Promise<{ fileUris: string[]; casesDeleted: number }> {
    if (!ERASURE_REASONS.includes(reason)) throw new ValidationError('Choose a reason');
    return this.db.tx(async () => {
      const files = await this.db.all<{ uri: string }>(
        `SELECT r.file_uri AS uri FROM recordings r JOIN cases k ON k.id = r.case_id WHERE k.client_id = ? AND r.file_uri IS NOT NULL
         UNION ALL SELECT d.file_uri AS uri FROM documents d JOIN cases k ON k.id = d.case_id WHERE k.client_id = ?`,
        [id, id],
      );
      const cases = await this.db.all<{ id: string }>('SELECT id FROM cases WHERE client_id = ?', [id]);
      await this.db.run('DELETE FROM clients WHERE id = ?', [id]);
      await this.audit({
        action: 'client.erased',
        entityType: 'client',
        entityId: id,
        caseId: null,
        details: { casesDeleted: cases.length, filesDeleted: files.length, reason },
      });
      return { fileUris: files.map((f) => f.uri), casesDeleted: cases.length };
    });
  }

  // ─────────────────────────────── cases ───────────────────────────────

  private async nextReference(): Promise<string> {
    const year = (this.ctx.now ? this.ctx.now() : new Date()).getFullYear();
    const key = `case_seq_${year}`;
    const n = Number((await this.getSetting(key)) ?? '0') + 1;
    await this.setSetting(key, String(n));
    return `MO-${year}-${String(n).padStart(4, '0')}`;
  }

  async createCase(clientId: string, input: { purpose?: string; numApplicants?: 1 | 2 } = {}): Promise<CaseRecord> {
    const client = await this.getClient(clientId);
    if (!client) throw new ValidationError('Client not found');
    const numApplicants = input.numApplicants === 2 ? 2 : 1;
    let ff = emptyFactFind(numApplicants);
    ff = setValue(ff, 'a1.personal.firstName', client.firstName);
    ff = setValue(ff, 'a1.personal.lastName', client.lastName);
    if (client.email) ff = setValue(ff, 'a1.contact.email', client.email);
    if (client.phone) ff = setValue(ff, 'a1.contact.mobile', client.phone);
    let purpose: string | null = null;
    if (input.purpose) {
      const r = coerceValue(getSection('mortgage')!.fields[0], input.purpose);
      if (r.ok && r.value) {
        purpose = r.value as string;
        ff = setValue(ff, 'case.mortgage.purpose', purpose);
      }
    }
    const now = this.now();
    const prov: ProvenanceMap = {};
    for (const p of ['a1.personal.firstName', 'a1.personal.lastName', 'a1.contact.email', 'a1.contact.mobile', 'case.mortgage.purpose'])
      prov[p] = { source: 'manual', at: now, by: this.ctx.actor() };
    return this.db.tx(async () => {
      const reference = await this.nextReference();
      const rec: CaseRecord = {
        id: uuid(), clientId, reference, purpose, status: 'Fact-find', numApplicants, factFind: ff, provenance: prov, createdAt: now, updatedAt: now,
      };
      await this.db.run(
        'INSERT INTO cases(id,client_id,reference,purpose,status,num_applicants,fact_find,provenance,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        [rec.id, clientId, reference, purpose, rec.status, numApplicants, j(ff), j(prov), now, now],
      );
      await this.audit({ action: 'case.created', entityType: 'case', entityId: rec.id, caseId: rec.id, details: { reference } });
      return rec;
    });
  }

  async getCase(id: string): Promise<CaseRecord | null> {
    const r = await this.db.get<any>('SELECT * FROM cases WHERE id = ?', [id]);
    return r ? mapCase(r) : null;
  }

  async listCases(clientId: string): Promise<CaseRecord[]> {
    return (await this.db.all<any>('SELECT * FROM cases WHERE client_id = ? ORDER BY updated_at DESC', [clientId])).map(mapCase);
  }

  async listRecentCases(limit = 10): Promise<(CaseRecord & { clientName: string })[]> {
    const rows = await this.db.all<any>(
      `SELECT k.*, c.first_name || ' ' || c.last_name AS client_name FROM cases k JOIN clients c ON c.id = k.client_id ORDER BY k.updated_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ ...mapCase(r), clientName: r.client_name }));
  }

  async setCaseStatus(caseId: string, status: CaseStatus): Promise<void> {
    if (!CASE_STATUSES.includes(status)) throw new ValidationError('Unknown status');
    await this.db.tx(async () => {
      const prev = await this.getCase(caseId);
      if (!prev) throw new ValidationError('Case not found');
      await this.db.run('UPDATE cases SET status=?, updated_at=? WHERE id=?', [status, this.now(), caseId]);
      await this.audit({ action: 'case.status_changed', entityType: 'case', entityId: caseId, caseId, details: { from: prev.status, to: status } });
    });
  }

  async setNumApplicants(caseId: string, n: 1 | 2): Promise<CaseRecord> {
    return this.db.tx(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new ValidationError('Case not found');
      const ff: FactFind = { ...c.factFind, numApplicants: n };
      await this.db.run('UPDATE cases SET num_applicants=?, fact_find=?, updated_at=? WHERE id=?', [n, j(ff), this.now(), caseId]);
      await this.audit({ action: 'case.applicants_changed', entityType: 'case', entityId: caseId, caseId, details: { applicants: n } });
      return { ...c, numApplicants: n, factFind: ff };
    });
  }

  private async writeFactFind(c: CaseRecord, ff: FactFind, prov: ProvenanceMap): Promise<void> {
    await this.db.run('UPDATE cases SET fact_find=?, provenance=?, updated_at=? WHERE id=?', [j(ff), j(prov), this.now(), c.id]);
    // Keep the client record's name/contact in sync with applicant 1.
    const p = (ff.a1.personal ?? {}) as Row;
    const ct = (ff.a1.contact ?? {}) as Row;
    if (p.firstName && p.lastName) {
      await this.db.run('UPDATE clients SET first_name=?, last_name=?, email=COALESCE(?, email), phone=COALESCE(?, phone), updated_at=? WHERE id=?', [
        String(p.firstName), String(p.lastName), (ct.email as string) ?? null, (ct.mobile as string) ?? null, this.now(), c.clientId,
      ]);
    }
  }

  /**
   * Save a scalar section from raw form input. Every value is validated; on any
   * error nothing is saved and a ValidationError lists the problems.
   */
  async saveSection(caseId: string, owner: Owner, sectionId: string, raw: Record<string, unknown>): Promise<CaseRecord> {
    const section = getSection(sectionId);
    if (!section || section.kind !== 'fields') throw new ValidationError('Unknown section');
    if ((owner === 'case') !== (section.scope === 'case')) throw new ValidationError('Section does not belong to owner');
    return this.db.tx(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new ValidationError('Case not found');
      if (owner === 'a2' && c.numApplicants !== 2) throw new ValidationError('Case has one applicant');
      const errors: Record<string, string> = {};
      let ff = c.factFind;
      const prov = { ...c.provenance };
      let changed = 0;
      const now = this.now();
      for (const f of section.fields) {
        if (!(f.key in raw)) continue;
        const r = coerceValue(f, raw[f.key]);
        if (!r.ok) {
          errors[f.key] = r.error;
          continue;
        }
        const path = `${owner}.${section.id}.${f.key}`;
        const before = ((ff[owner][section.id] ?? {}) as Row)[f.key] ?? null;
        if (before === r.value) continue;
        ff = setValue(ff, path, r.value);
        if (r.value === null) delete prov[path];
        else prov[path] = { source: 'manual', at: now, by: this.ctx.actor() };
        changed++;
      }
      if (Object.keys(errors).length) throw new ValidationError('Please correct the highlighted fields', errors);
      if (changed === 0) return c;
      await this.writeFactFind(c, ff, prov);
      await this.audit({ action: 'factfind.updated', entityType: 'case', entityId: caseId, caseId, details: { owner, section: sectionId, fieldsChanged: changed } });
      return { ...c, factFind: ff, provenance: prov };
    });
  }

  /** Replace all rows of a list section (rows are validated individually). */
  async saveList(caseId: string, owner: Owner, sectionId: string, rawRows: Record<string, unknown>[], none = false): Promise<CaseRecord> {
    const section = getSection(sectionId);
    if (!section || section.kind !== 'list') throw new ValidationError('Unknown list section');
    if ((owner === 'case') !== (section.scope === 'case')) throw new ValidationError('Section does not belong to owner');
    return this.db.tx(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new ValidationError('Case not found');
      const errors: Record<string, string> = {};
      const rows: Row[] = [];
      rawRows.forEach((raw, i) => {
        const { row, errors: e } = coerceRow(section, raw);
        for (const [k, v] of Object.entries(e)) errors[`${i}.${k}`] = v;
        rows.push(row);
      });
      if (Object.keys(errors).length) throw new ValidationError('Please correct the highlighted rows', errors);
      const path = `${owner}.${sectionId}`;
      let ff = setList(c.factFind, path, rows);
      ff = setListNone(ff, path, none && rows.length === 0);
      const prov = { ...c.provenance, [path]: { source: 'manual' as const, at: this.now(), by: this.ctx.actor() } };
      await this.writeFactFind(c, ff, prov);
      await this.audit({ action: 'factfind.updated', entityType: 'case', entityId: caseId, caseId, details: { owner, section: sectionId, rows: rows.length } });
      return { ...c, factFind: ff, provenance: prov };
    });
  }

  // ─────────────────────────────── recordings ───────────────────────────────

  async createRecording(input: {
    caseId: string;
    fileUri: string;
    mime: string;
    durationMs: number;
    sizeBytes: number | null;
    consentConfirmedAt: string;
  }): Promise<Recording> {
    if (!input.consentConfirmedAt) throw new ValidationError('Recording consent must be confirmed first');
    const now = this.now();
    const r: Recording = {
      id: uuid(),
      caseId: input.caseId,
      fileUri: input.fileUri,
      mime: input.mime,
      durationMs: input.durationMs,
      sizeBytes: input.sizeBytes,
      consentConfirmedAt: input.consentConfirmedAt,
      consentConfirmedBy: this.ctx.actor(),
      disclosureVersion: RECORDING_DISCLOSURE_VERSION,
      status: 'recorded',
      remoteJobId: null,
      transcript: null,
      utterances: [],
      provider: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.tx(async () => {
      if (!(await this.getCase(input.caseId))) throw new ValidationError('Case not found');
      await this.db.run(
        `INSERT INTO recordings(id,case_id,file_uri,mime,duration_ms,size_bytes,consent_confirmed_at,consent_confirmed_by,disclosure_version,status,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.id, r.caseId, r.fileUri, r.mime, r.durationMs, r.sizeBytes, r.consentConfirmedAt, r.consentConfirmedBy, r.disclosureVersion, r.status, now, now],
      );
      await this.audit({
        action: 'recording.consent_confirmed', entityType: 'recording', entityId: r.id, caseId: r.caseId,
        details: { disclosureVersion: r.disclosureVersion, confirmedAt: r.consentConfirmedAt },
      });
      await this.audit({ action: 'recording.saved', entityType: 'recording', entityId: r.id, caseId: r.caseId, details: { durationMs: r.durationMs } });
    });
    return r;
  }

  async getRecording(id: string): Promise<Recording | null> {
    const r = await this.db.get<any>('SELECT * FROM recordings WHERE id = ?', [id]);
    return r ? mapRecording(r) : null;
  }

  async listRecordings(caseId: string): Promise<Recording[]> {
    return (await this.db.all<any>('SELECT * FROM recordings WHERE case_id = ? ORDER BY created_at DESC', [caseId])).map(mapRecording);
  }

  async markTranscriptionStarted(id: string, remoteJobId: string, provider: string): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.getRecording(id);
      if (!r) throw new ValidationError('Recording not found');
      await this.db.run('UPDATE recordings SET status=?, remote_job_id=?, provider=?, error=NULL, updated_at=? WHERE id=?', ['processing', remoteJobId, provider, this.now(), id]);
      await this.audit({ action: 'transcription.requested', entityType: 'recording', entityId: id, caseId: r.caseId, details: { provider } });
    });
  }

  async setTranscript(id: string, transcript: string, utterances: Utterance[]): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.getRecording(id);
      if (!r) throw new ValidationError('Recording not found');
      await this.db.run('UPDATE recordings SET status=?, transcript=?, utterances=?, error=NULL, updated_at=? WHERE id=?', [
        'transcribed', transcript, j(utterances), this.now(), id,
      ]);
      await this.audit({ action: 'transcription.completed', entityType: 'recording', entityId: id, caseId: r.caseId, details: { utterances: utterances.length, chars: transcript.length } });
      const c = await this.getCase(r.caseId);
      if (c && c.status === 'Fact-find') {
        await this.db.run('UPDATE cases SET status=?, updated_at=? WHERE id=?', ['Meeting held', this.now(), c.id]);
        await this.audit({ action: 'case.status_changed', entityType: 'case', entityId: c.id, caseId: c.id, details: { from: c.status, to: 'Meeting held' } });
      }
    });
  }

  async markTranscriptionFailed(id: string, error: string): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.getRecording(id);
      if (!r) throw new ValidationError('Recording not found');
      await this.db.run('UPDATE recordings SET status=?, error=?, updated_at=? WHERE id=?', ['failed', error.slice(0, 500), this.now(), id]);
      await this.audit({ action: 'transcription.failed', entityType: 'recording', entityId: id, caseId: r.caseId, details: { error: error.slice(0, 80) } });
    });
  }

  /** Remove the local audio file reference (e.g. after retention period). Transcript is kept. */
  async clearRecordingAudio(id: string): Promise<string | null> {
    return this.db.tx(async () => {
      const r = await this.getRecording(id);
      if (!r) throw new ValidationError('Recording not found');
      await this.db.run('UPDATE recordings SET file_uri=NULL, updated_at=? WHERE id=?', [this.now(), id]);
      await this.audit({ action: 'recording.deleted', entityType: 'recording', entityId: id, caseId: r.caseId, details: {} });
      return r.fileUri;
    });
  }

  // ─────────────────────────────── extractions ───────────────────────────────

  async createExtraction(caseId: string, recordingId: string | null, proposal: ExtractionProposal, model: string): Promise<Extraction> {
    const now = this.now();
    const id = uuid();
    return this.db.tx(async () => {
      const c = await this.getCase(caseId);
      if (!c) throw new ValidationError('Case not found');
      await this.db.run(
        'INSERT INTO extractions(id,case_id,recording_id,model,prompt_version,summary,rejected,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [id, caseId, recordingId, model, proposal.promptVersion, j(proposal.summary), j(proposal.rejected), 'pending_review', now],
      );
      let ord = 0;
      for (const f of proposal.fields) {
        await this.db.run(
          'INSERT INTO extraction_items(id,extraction_id,ord,kind,path,proposed,raw_value,confidence,evidence) VALUES(?,?,?,?,?,?,?,?,?)',
          [uuid(), id, ord++, 'field', f.path, j(f.value), f.rawValue, f.confidence, f.evidence],
        );
      }
      for (const li of proposal.listItems) {
        await this.db.run(
          'INSERT INTO extraction_items(id,extraction_id,ord,kind,path,proposed,raw_value,confidence,evidence) VALUES(?,?,?,?,?,?,?,?,?)',
          [uuid(), id, ord++, 'list_item', li.list, j(li.item), null, li.confidence, li.evidence],
        );
      }
      await this.audit({
        action: 'extraction.created', entityType: 'extraction', entityId: id, caseId,
        details: { model, fields: proposal.fields.length, listItems: proposal.listItems.length, rejected: proposal.rejected.length },
      });
      if (c.status === 'Fact-find' || c.status === 'Meeting held') {
        await this.db.run('UPDATE cases SET status=?, updated_at=? WHERE id=?', ['AI review', now, caseId]);
        await this.audit({ action: 'case.status_changed', entityType: 'case', entityId: caseId, caseId, details: { from: c.status, to: 'AI review' } });
      }
      return (await this.getExtraction(id))!;
    });
  }

  async getExtraction(id: string): Promise<Extraction | null> {
    const r = await this.db.get<any>('SELECT * FROM extractions WHERE id = ?', [id]);
    if (!r) return null;
    const items = await this.db.all<any>('SELECT * FROM extraction_items WHERE extraction_id = ? ORDER BY ord', [id]);
    return mapExtraction(r, items.map(mapItem));
  }

  async listExtractions(caseId: string): Promise<Extraction[]> {
    const rows = await this.db.all<any>('SELECT * FROM extractions WHERE case_id = ? ORDER BY created_at DESC', [caseId]);
    const out: Extraction[] = [];
    for (const r of rows) {
      const items = await this.db.all<any>('SELECT * FROM extraction_items WHERE extraction_id = ? ORDER BY ord', [r.id]);
      out.push(mapExtraction(r, items.map(mapItem)));
    }
    return out;
  }

  /**
   * Broker decision on one proposed value. Accepting writes the value into the
   * fact-find with AI provenance; rejecting leaves the fact-find untouched.
   */
  async decideItem(itemId: string, decision: 'accepted' | 'rejected' | 'edited', editedValue?: unknown): Promise<ExtractionItem> {
    return this.db.tx(async () => {
      const raw = await this.db.get<any>('SELECT * FROM extraction_items WHERE id = ?', [itemId]);
      if (!raw) throw new ValidationError('Item not found');
      const item = mapItem(raw);
      if (item.decision !== 'pending') throw new ValidationError('Item already decided');
      const ex = await this.db.get<any>('SELECT * FROM extractions WHERE id = ?', [item.extractionId]);
      const c = await this.getCase(ex.case_id);
      if (!c) throw new ValidationError('Case not found');
      const now = this.now();
      let finalValue: FieldValue | Row | null = null;

      if (decision !== 'rejected') {
        const p = parsePath(item.path);
        if (!p) throw new ValidationError('Path no longer valid');
        if ((p.owner === 'a2') && c.numApplicants !== 2) throw new ValidationError('Case has one applicant — add applicant 2 first');
        let ff = c.factFind;
        const prov = { ...c.provenance };
        if (item.kind === 'field') {
          const r = coerceValue(p.field!, decision === 'edited' ? editedValue : item.proposed);
          if (!r.ok) throw new ValidationError(r.error, { value: r.error });
          if (r.value === null) throw new ValidationError('Value is empty', { value: 'Required' });
          finalValue = r.value;
          const current = getValue(ff, item.path);
          if (current !== r.value) {
            ff = setValue(ff, item.path, r.value);
            prov[item.path] = { source: 'ai', at: now, by: this.ctx.actor(), extractionId: item.extractionId, confidence: item.confidence };
          }
          // Same value already recorded: keep the existing provenance (e.g. manual entry).
        } else {
          const src = (decision === 'edited' ? editedValue : item.proposed) as Record<string, unknown>;
          const { row, errors } = coerceRow(p.section, src ?? {});
          if (Object.keys(errors).length) throw new ValidationError('Please correct the item', errors);
          finalValue = row;
          ff = setList(ff, item.path, [...getList(ff, item.path), row]);
          ff = setListNone(ff, item.path, false);
          prov[item.path] = { source: 'ai', at: now, by: this.ctx.actor(), extractionId: item.extractionId, confidence: item.confidence };
        }
        await this.writeFactFind(c, ff, prov);
      }

      await this.db.run('UPDATE extraction_items SET decision=?, final_value=?, decided_at=?, decided_by=? WHERE id=?', [
        decision, finalValue === null ? null : j(finalValue), now, this.ctx.actor(), itemId,
      ]);
      await this.audit({
        action: decision === 'accepted' ? 'extraction.item_accepted' : decision === 'edited' ? 'extraction.item_edited' : 'extraction.item_rejected',
        entityType: 'extraction_item', entityId: itemId, caseId: c.id,
        details: { path: item.path, confidence: item.confidence },
      });
      const pending = await this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM extraction_items WHERE extraction_id = ? AND decision = 'pending'", [item.extractionId]);
      if (Number(pending?.n ?? 0) === 0) await this.db.run("UPDATE extractions SET status='reviewed', reviewed_at=? WHERE id=?", [now, item.extractionId]);
      return { ...item, decision, finalValue, decidedAt: now, decidedBy: this.ctx.actor() };
    });
  }

  /**
   * Accept every pending item at or above the threshold (default: high band).
   * Items that would overwrite a different existing value are skipped so the
   * broker decides those individually.
   */
  async acceptAllAbove(extractionId: string, threshold = 0.85): Promise<{ accepted: number; failed: number; skippedConflicts: number }> {
    const ex = await this.getExtraction(extractionId);
    if (!ex) throw new ValidationError('Extraction not found');
    const c = await this.getCase(ex.caseId);
    let accepted = 0;
    let failed = 0;
    let skippedConflicts = 0;
    for (const it of ex.items) {
      if (it.decision !== 'pending' || it.confidence < threshold) continue;
      if (c && it.kind === 'field') {
        const current = getValue(c.factFind, it.path);
        if (current !== null && current !== it.proposed) {
          skippedConflicts++;
          continue;
        }
      }
      try {
        await this.decideItem(it.id, 'accepted');
        accepted++;
      } catch {
        failed++;
      }
    }
    return { accepted, failed, skippedConflicts };
  }

  // ─────────────────────────────── consents ───────────────────────────────

  async saveConsent(input: {
    caseId: string;
    applicantIndex: 1 | 2;
    signerName: string;
    answers: Record<string, boolean>;
    signatureDataUrl: string;
    signedAt: Date;
    timeZone: string;
    device: string;
  }): Promise<ConsentRecord> {
    const missing = validateConsentAnswers(input.answers);
    const errors: Record<string, string> = {};
    if (missing.length) errors.answers = `Required: ${missing.join(' | ')}`;
    if (!input.signerName.trim()) errors.signerName = 'Signer name required';
    if (!/^data:image\/(png|svg\+xml|jpeg);base64,[A-Za-z0-9+/=]{100,}$/.test(input.signatureDataUrl)) errors.signature = 'Signature missing';
    if (Object.keys(errors).length) throw new ValidationError('Consent incomplete', errors);
    const c = await this.getCase(input.caseId);
    if (!c) throw new ValidationError('Case not found');
    if (input.applicantIndex === 2 && c.numApplicants !== 2) throw new ValidationError('Case has one applicant');
    const core: ConsentRecordCore = {
      id: uuid(),
      caseId: input.caseId,
      applicantIndex: input.applicantIndex,
      signerName: input.signerName.trim(),
      consentVersion: CONSENT_VERSION,
      consentTextHash: consentTextHash(),
      answers: input.answers,
      signatureSha256: signatureHash(input.signatureDataUrl),
      signedAtUtc: input.signedAt.toISOString(),
      signedAtLocal: localIso(input.signedAt),
      timeZone: input.timeZone,
      brokerName: this.ctx.actor(),
      device: input.device.slice(0, 200),
    };
    const recordHash = consentRecordHash(core);
    const now = this.now();
    await this.db.tx(async () => {
      await this.db.run(
        `INSERT INTO consents(id,case_id,applicant_index,signer_name,consent_version,consent_text_hash,answers,signature,signature_sha256,
          signed_at_utc,signed_at_local,time_zone,broker_name,device,record_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [core.id, core.caseId, core.applicantIndex, core.signerName, core.consentVersion, core.consentTextHash, j(core.answers),
          input.signatureDataUrl, core.signatureSha256, core.signedAtUtc, core.signedAtLocal, core.timeZone, core.brokerName, core.device, recordHash, now],
      );
      await this.audit({
        action: 'consent.signed', entityType: 'consent', entityId: core.id, caseId: core.caseId,
        details: { applicant: core.applicantIndex, version: core.consentVersion, recordHash },
      });
      const fresh = await this.getCase(core.caseId);
      if (fresh && ['Fact-find', 'Meeting held', 'AI review'].includes(fresh.status)) {
        const all = await this.listConsents(core.caseId);
        const signed = new Set(all.filter((x) => !x.withdrawnAt).map((x) => x.applicantIndex));
        if (signed.size >= fresh.numApplicants) {
          await this.db.run('UPDATE cases SET status=?, updated_at=? WHERE id=?', ['Consent signed', now, fresh.id]);
          await this.audit({ action: 'case.status_changed', entityType: 'case', entityId: fresh.id, caseId: fresh.id, details: { from: fresh.status, to: 'Consent signed' } });
        }
      }
    });
    return { ...core, signature: input.signatureDataUrl, recordHash, withdrawnAt: null, createdAt: now };
  }

  async listConsents(caseId: string): Promise<ConsentRecord[]> {
    return (await this.db.all<any>('SELECT * FROM consents WHERE case_id = ? ORDER BY signed_at_utc DESC', [caseId])).map(mapConsent);
  }

  async withdrawConsent(id: string): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.db.get<any>('SELECT * FROM consents WHERE id = ?', [id]);
      if (!r) throw new ValidationError('Consent not found');
      await this.db.run('UPDATE consents SET withdrawn_at=? WHERE id=?', [this.now(), id]);
      await this.audit({ action: 'consent.withdrawn', entityType: 'consent', entityId: id, caseId: r.case_id, details: {} });
    });
  }

  /** Recompute a consent's hash and compare it with the stored one. */
  verifyConsent(c: ConsentRecord): boolean {
    const { signature, recordHash, withdrawnAt, createdAt, ...core } = c;
    void withdrawnAt; void createdAt;
    return signatureHash(signature) === core.signatureSha256 && consentRecordHash(core) === recordHash;
  }

  // ─────────────────────────────── documents & notes ───────────────────────────────

  async addDocument(input: Omit<DocumentRecord, 'id' | 'createdAt'>): Promise<DocumentRecord> {
    if (!input.name.trim()) throw new ValidationError('Name required');
    const d: DocumentRecord = { ...input, id: uuid(), createdAt: this.now() };
    await this.db.tx(async () => {
      await this.db.run('INSERT INTO documents(id,case_id,category,name,mime,size_bytes,file_uri,sha256,created_at) VALUES(?,?,?,?,?,?,?,?,?)', [
        d.id, d.caseId, d.category, d.name, d.mime, d.sizeBytes, d.fileUri, d.sha256, d.createdAt,
      ]);
      await this.audit({ action: 'document.added', entityType: 'document', entityId: d.id, caseId: d.caseId, details: { category: d.category, sha256: d.sha256 } });
    });
    return d;
  }

  async listDocuments(caseId: string): Promise<DocumentRecord[]> {
    return (await this.db.all<any>('SELECT * FROM documents WHERE case_id = ? ORDER BY created_at DESC', [caseId])).map(mapDocument);
  }

  async deleteDocument(id: string): Promise<string | null> {
    return this.db.tx(async () => {
      const r = await this.db.get<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!r) return null;
      await this.db.run('DELETE FROM documents WHERE id = ?', [id]);
      await this.audit({ action: 'document.deleted', entityType: 'document', entityId: id, caseId: r.case_id, details: { category: r.category } });
      return r.file_uri as string;
    });
  }

  async addNote(caseId: string, body: string): Promise<Note> {
    const text = body.trim();
    if (!text) throw new ValidationError('Note is empty');
    if (text.length > 10_000) throw new ValidationError('Note is too long');
    const n: Note = { id: uuid(), caseId, body: text, author: this.ctx.actor(), createdAt: this.now() };
    await this.db.tx(async () => {
      await this.db.run('INSERT INTO notes(id,case_id,body,author,created_at) VALUES(?,?,?,?,?)', [n.id, caseId, n.body, n.author, n.createdAt]);
      await this.audit({ action: 'note.added', entityType: 'note', entityId: n.id, caseId, details: { chars: n.body.length } });
    });
    return n;
  }

  async listNotes(caseId: string): Promise<Note[]> {
    return (await this.db.all<any>('SELECT * FROM notes WHERE case_id = ? ORDER BY created_at DESC', [caseId])).map((r) => ({
      id: r.id, caseId: r.case_id, body: r.body, author: r.author, createdAt: r.created_at,
    }));
  }

  // ─────────────────────────────── export ───────────────────────────────

  /** Everything held about one case (for subject-access requests / secure export). */
  async caseBundle(caseId: string) {
    const c = await this.getCase(caseId);
    if (!c) throw new ValidationError('Case not found');
    const client = await this.getClient(c.clientId);
    return {
      exportedAt: this.now(),
      client,
      case: c,
      recordings: (await this.listRecordings(caseId)).map(({ fileUri, ...r }) => ({ ...r, hasAudio: !!fileUri })),
      extractions: await this.listExtractions(caseId),
      consents: await this.listConsents(caseId),
      documents: await this.listDocuments(caseId),
      notes: await this.listNotes(caseId),
      audit: (await this.listAudit(caseId, 10_000)).reverse(),
    };
  }

  async counts(): Promise<{ clients: number; cases: number; audit: number }> {
    const q = async (sql: string) => Number((await this.db.get<{ n: number }>(sql))?.n ?? 0);
    return {
      clients: await q('SELECT COUNT(*) AS n FROM clients'),
      cases: await q('SELECT COUNT(*) AS n FROM cases'),
      audit: await q('SELECT COUNT(*) AS n FROM audit_log'),
    };
  }
}

export function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}

// ─────────────────────────────── row mappers ───────────────────────────────

function mapClient(r: any): Client {
  return {
    id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email ?? null, phone: r.phone ?? null,
    isDemo: Number(r.is_demo) === 1, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapCase(r: any): CaseRecord {
  const n = Number(r.num_applicants) === 2 ? 2 : 1;
  const ff = parseFactFind(r.fact_find, n);
  ff.numApplicants = n;
  return {
    id: r.id, clientId: r.client_id, reference: r.reference, purpose: r.purpose ?? null, status: r.status, numApplicants: n,
    factFind: ff, provenance: pj(r.provenance, {}), createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapRecording(r: any): Recording {
  return {
    id: r.id, caseId: r.case_id, fileUri: r.file_uri ?? null, mime: r.mime ?? null, durationMs: r.duration_ms ?? null,
    sizeBytes: r.size_bytes ?? null, consentConfirmedAt: r.consent_confirmed_at, consentConfirmedBy: r.consent_confirmed_by,
    disclosureVersion: r.disclosure_version, status: r.status, remoteJobId: r.remote_job_id ?? null, transcript: r.transcript ?? null,
    utterances: pj(r.utterances, []), provider: r.provider ?? null, error: r.error ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapItem(r: any): ExtractionItem {
  return {
    id: r.id, extractionId: r.extraction_id, ord: Number(r.ord), kind: r.kind, path: r.path, proposed: pj(r.proposed, null),
    rawValue: r.raw_value ?? null, confidence: Number(r.confidence), evidence: r.evidence ?? null, decision: r.decision,
    finalValue: pj(r.final_value, null), decidedAt: r.decided_at ?? null, decidedBy: r.decided_by ?? null,
  };
}

function mapExtraction(r: any, items: ExtractionItem[]): Extraction {
  return {
    id: r.id, caseId: r.case_id, recordingId: r.recording_id ?? null, model: r.model ?? null, promptVersion: r.prompt_version ?? null,
    summary: pj(r.summary, {} as MeetingSummary), rejected: pj(r.rejected, []), status: r.status, createdAt: r.created_at,
    reviewedAt: r.reviewed_at ?? null, items,
  };
}

function mapConsent(r: any): ConsentRecord {
  return {
    id: r.id, caseId: r.case_id, applicantIndex: Number(r.applicant_index) === 2 ? 2 : 1, signerName: r.signer_name,
    consentVersion: r.consent_version, consentTextHash: r.consent_text_hash, answers: pj(r.answers, {}), signatureSha256: r.signature_sha256,
    signedAtUtc: r.signed_at_utc, signedAtLocal: r.signed_at_local, timeZone: r.time_zone, brokerName: r.broker_name, device: r.device,
    signature: r.signature, recordHash: r.record_hash, withdrawnAt: r.withdrawn_at ?? null, createdAt: r.created_at,
  };
}

function mapDocument(r: any): DocumentRecord {
  return {
    id: r.id, caseId: r.case_id, category: r.category, name: r.name, mime: r.mime ?? null, sizeBytes: r.size_bytes ?? null,
    fileUri: r.file_uri, sha256: r.sha256 ?? null, createdAt: r.created_at,
  };
}

function mapAudit(r: any): AuditEntry {
  return {
    seq: Number(r.seq), id: r.id, ts: r.ts, actor: r.actor, action: r.action, entityType: r.entity_type, entityId: r.entity_id ?? null,
    caseId: r.case_id ?? null, details: pj(r.details, {}), prevHash: r.prev_hash, hash: r.hash,
  };
}

export type { SqlParam };
