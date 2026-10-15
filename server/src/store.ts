import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: 'broker' | 'admin';
  disabled: boolean;
  createdAt: string;
}

export interface Job {
  id: string;
  userId: string;
  status: JobStatus;
  provider: string;
  providerJobId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  hasResult: boolean;
}

/** Server-side persistence. Holds no client data except short-lived, encrypted transcripts. */
export class Store {
  db: DatabaseSync;
  key: Buffer;

  constructor(dataDir: string, dataKey: Buffer, file = 'server.db') {
    let target = file;
    if (file !== ':memory:') {
      fs.mkdirSync(dataDir, { recursive: true });
      target = path.join(dataDir, file);
    }
    this.db = new DatabaseSync(target);
    this.key = dataKey;
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'broker', disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs(
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, provider TEXT NOT NULL,
        provider_job_id TEXT, error TEXT, result BLOB, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit(
        id INTEGER PRIMARY KEY, ts TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, ip TEXT, details TEXT
      );
    `);
  }

  close() {
    this.db.close();
  }

  // ── users ──
  createUser(username: string, displayName: string, passwordHash: string, role: 'broker' | 'admin' = 'broker'): User {
    const u: User = { id: crypto.randomUUID(), username, displayName, passwordHash, role, disabled: false, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(u.id, username, displayName, passwordHash, role, u.createdAt);
    return u;
  }

  setPassword(username: string, passwordHash: string): boolean {
    return Number(this.db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(passwordHash, username).changes) > 0;
  }

  setDisabled(username: string, disabled: boolean): boolean {
    return Number(this.db.prepare('UPDATE users SET disabled=? WHERE username=?').run(disabled ? 1 : 0, username).changes) > 0;
  }

  userByName(username: string): User | null {
    const r = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    return r ? mapUser(r) : null;
  }

  userById(id: string): User | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return r ? mapUser(r) : null;
  }

  countUsers(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n);
  }

  // ── jobs ──
  createJob(userId: string, provider: string, ttlMs = 24 * 3600_000): Job {
    const now = new Date();
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO jobs(id,user_id,status,provider,created_at,updated_at,expires_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, userId, 'queued', provider, now.toISOString(), now.toISOString(), new Date(now.getTime() + ttlMs).toISOString());
    return this.getJob(id)!;
  }

  getJob(id: string): Job | null {
    const r = this.db.prepare('SELECT id,user_id,status,provider,provider_job_id,error,created_at,updated_at,expires_at,(result IS NOT NULL) AS has_result FROM jobs WHERE id = ?').get(id) as any;
    return r ? mapJob(r) : null;
  }

  activeJobs(): Job[] {
    return (this.db.prepare("SELECT id,user_id,status,provider,provider_job_id,error,created_at,updated_at,expires_at,0 AS has_result FROM jobs WHERE status IN ('queued','processing')").all() as any[]).map(mapJob);
  }

  updateJob(id: string, patch: { status?: JobStatus; providerJobId?: string; error?: string | null }) {
    const j = this.getJob(id);
    if (!j) return;
    this.db
      .prepare('UPDATE jobs SET status=?, provider_job_id=?, error=?, updated_at=? WHERE id=?')
      .run(patch.status ?? j.status, patch.providerJobId ?? j.providerJobId, patch.error === undefined ? j.error : patch.error, new Date().toISOString(), id);
  }

  /** Store a job result encrypted with AES-256-GCM under DATA_KEY. */
  setJobResult(id: string, result: unknown) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    c.setAAD(Buffer.from(id));
    const ct = Buffer.concat([c.update(JSON.stringify(result), 'utf8'), c.final()]);
    const blob = Buffer.concat([iv, c.getAuthTag(), ct]);
    this.db.prepare("UPDATE jobs SET result=?, status='completed', error=NULL, updated_at=? WHERE id=?").run(blob, new Date().toISOString(), id);
  }

  getJobResult<T>(id: string): T | null {
    const r = this.db.prepare('SELECT result FROM jobs WHERE id = ?').get(id) as any;
    if (!r?.result) return null;
    const blob = Buffer.from(r.result);
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, blob.subarray(0, 12));
      d.setAAD(Buffer.from(id));
      d.setAuthTag(blob.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8')) as T;
    } catch {
      // Key changed (e.g. demo mode restarted) or data tampered with: treat as unavailable.
      return null;
    }
  }

  purgeJobResult(id: string) {
    this.db.prepare('UPDATE jobs SET result=NULL, updated_at=? WHERE id=?').run(new Date().toISOString(), id);
  }

  /** Remove transcripts past their expiry. Returns number purged. */
  purgeExpired(now = new Date()): number {
    return Number(this.db.prepare('UPDATE jobs SET result=NULL WHERE result IS NOT NULL AND expires_at < ?').run(now.toISOString()).changes);
  }

  // ── audit (operational; never contains transcript text or personal data) ──
  audit(action: string, userId: string | null, ip: string | null, details: Record<string, unknown> = {}) {
    this.db.prepare('INSERT INTO audit(ts,user_id,action,ip,details) VALUES(?,?,?,?,?)').run(new Date().toISOString(), userId, action, ip, JSON.stringify(details));
  }

  auditRows(limit = 100): any[] {
    return this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit) as any[];
  }
}

function mapUser(r: any): User {
  return { id: r.id, username: r.username, displayName: r.display_name, passwordHash: r.password_hash, role: r.role, disabled: !!r.disabled, createdAt: r.created_at };
}

function mapJob(r: any): Job {
  return {
    id: r.id, userId: r.user_id, status: r.status, provider: r.provider, providerJobId: r.provider_job_id ?? null, error: r.error ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at, hasResult: !!r.has_result,
  };
}
