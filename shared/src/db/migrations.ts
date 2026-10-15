import type { Db } from './adapter.ts';

/** Ordered migrations; index + 1 = schema version stored in PRAGMA user_version. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS clients(
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS cases(
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    reference TEXT NOT NULL UNIQUE,
    purpose TEXT,
    status TEXT NOT NULL,
    num_applicants INTEGER NOT NULL DEFAULT 1,
    fact_find TEXT NOT NULL,
    provenance TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);
  CREATE TABLE IF NOT EXISTS recordings(
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    file_uri TEXT,
    mime TEXT,
    duration_ms INTEGER,
    size_bytes INTEGER,
    consent_confirmed_at TEXT NOT NULL,
    consent_confirmed_by TEXT NOT NULL,
    disclosure_version TEXT NOT NULL,
    status TEXT NOT NULL,
    remote_job_id TEXT,
    transcript TEXT,
    utterances TEXT,
    provider TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_recordings_case ON recordings(case_id);
  CREATE TABLE IF NOT EXISTS extractions(
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    recording_id TEXT REFERENCES recordings(id) ON DELETE SET NULL,
    model TEXT,
    prompt_version TEXT,
    summary TEXT NOT NULL,
    rejected TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    reviewed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_extractions_case ON extractions(case_id);
  CREATE TABLE IF NOT EXISTS extraction_items(
    id TEXT PRIMARY KEY,
    extraction_id TEXT NOT NULL REFERENCES extractions(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    proposed TEXT NOT NULL,
    raw_value TEXT,
    confidence REAL NOT NULL,
    evidence TEXT,
    decision TEXT NOT NULL DEFAULT 'pending',
    final_value TEXT,
    decided_at TEXT,
    decided_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_items_extraction ON extraction_items(extraction_id);
  CREATE TABLE IF NOT EXISTS consents(
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    applicant_index INTEGER NOT NULL,
    signer_name TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    consent_text_hash TEXT NOT NULL,
    answers TEXT NOT NULL,
    signature TEXT NOT NULL,
    signature_sha256 TEXT NOT NULL,
    signed_at_utc TEXT NOT NULL,
    signed_at_local TEXT NOT NULL,
    time_zone TEXT NOT NULL,
    broker_name TEXT NOT NULL,
    device TEXT NOT NULL,
    record_hash TEXT NOT NULL,
    withdrawn_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_consents_case ON consents(case_id);
  CREATE TABLE IF NOT EXISTS documents(
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER,
    file_uri TEXT NOT NULL,
    sha256 TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
  CREATE TABLE IF NOT EXISTS notes(
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_case ON notes(case_id);
  CREATE TABLE IF NOT EXISTS audit_log(
    seq INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    ts TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    case_id TEXT,
    details TEXT NOT NULL,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
  CREATE TABLE IF NOT EXISTS settings(
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON;');
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  let v = row?.user_version ?? 0;
  while (v < MIGRATIONS.length) {
    const sql = MIGRATIONS[v];
    const next = v + 1;
    await db.tx(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    v = next;
  }
  return v;
}
