/**
 * Client for the Mortgage Options backend. Platform-specific pieces (HTTP and
 * file upload) are injected so the same code runs in the app and in tests.
 */
import { DEMO_EXTRACTION_RAW, DEMO_TRANSCRIPT, DEMO_UTTERANCES } from './demo.ts';
import { normaliseExtraction, type ExtractionProposal } from './extraction.ts';
import type { Utterance } from './db/repo.ts';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface UploadFn {
  (url: string, fileUri: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
}

export type TranscriptionStatus =
  | { status: 'queued' | 'processing'; provider: string }
  | { status: 'error'; provider: string; error: string }
  | { status: 'completed'; provider: string; transcript: string; utterances: Utterance[] }
  | { status: 'expired'; provider: string };

export interface Backend {
  readonly kind: 'server' | 'offline-demo';
  login(username: string, password: string): Promise<{ token: string; expiresAt: string; displayName: string; mode: string }>;
  me(): Promise<{ displayName: string; mode: string }>;
  health(): Promise<{ ok: boolean; mode: string; version: string; transcription: string; extraction: string }>;
  startTranscription(fileUri: string, mime: string): Promise<{ id: string; provider: string }>;
  getTranscription(id: string): Promise<TranscriptionStatus>;
  deleteTranscription(id: string): Promise<void>;
  extract(transcript: string, numApplicants: 1 | 2): Promise<{ model: string; proposal: ExtractionProposal }>;
}

/** Parse with a regex rather than URL — React Native's URL support varies. */
export function normaliseBaseUrl(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '');
  const m = s.match(/^(?:(https?):\/\/)?([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?(?:\/.*)?$/i);
  if (!m) throw new Error('Enter a server address like https://example.trycloudflare.com or http://192.168.1.20:3005');
  const scheme = (m[1] ?? 'https').toLowerCase();
  return `${scheme}://${m[2].toLowerCase()}${m[3] ? `:${m[3]}` : ''}`;
}

export function isInsecureUrl(base: string): boolean {
  return !/^https:\/\//i.test(base);
}

/** Plain HTTP is only acceptable to a private network address during testing. */
export function isPrivateHost(base: string): boolean {
  const host = base.replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

export class ServerBackend implements Backend {
  readonly kind = 'server' as const;
  base: string;
  token: string | null;
  fetchFn: typeof fetch;
  upload: UploadFn;

  constructor(base: string, token: string | null, fetchFn: typeof fetch, upload: UploadFn) {
    this.base = normaliseBaseUrl(base);
    this.token = token;
    this.fetchFn = fetchFn;
    this.upload = upload;
  }

  private async req<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.auth !== false && this.token) headers.authorization = `Bearer ${this.token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: ctrl.signal,
      });
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      throw new ApiError(0, aborted ? 'timeout' : 'network', aborted ? 'The server took too long to respond' : 'Cannot reach the server — check the address and your connection');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) throw new ApiError(res.status, body?.error ?? 'http_error', body?.message ?? `Server error (${res.status})`);
    return body as T;
  }

  async health() {
    return this.req<any>('/health', { auth: false, timeoutMs: 10_000 });
  }

  async login(username: string, password: string) {
    const r = await this.req<any>('/api/auth/login', { method: 'POST', body: { username, password }, auth: false });
    this.token = r.token;
    return { token: r.token, expiresAt: r.expiresAt, displayName: r.user.displayName, mode: r.mode };
  }

  async me() {
    const r = await this.req<any>('/api/auth/me');
    return { displayName: r.user.displayName, mode: r.mode };
  }

  async startTranscription(fileUri: string, mime: string) {
    if (!this.token) throw new ApiError(401, 'unauthorised', 'Sign in to the server first (Settings)');
    let r: { status: number; body: string };
    try {
      r = await this.upload(`${this.base}/api/transcriptions`, fileUri, { authorization: `Bearer ${this.token}`, 'content-type': mime });
    } catch {
      throw new ApiError(0, 'network', 'Upload failed — check your connection and try again');
    }
    let body: any = null;
    try {
      body = JSON.parse(r.body);
    } catch {
      body = null;
    }
    if (r.status !== 202) throw new ApiError(r.status, body?.error ?? 'upload_failed', body?.message ?? `Upload failed (${r.status})`);
    return { id: String(body.id), provider: String(body.provider) };
  }

  async getTranscription(id: string): Promise<TranscriptionStatus> {
    try {
      const r = await this.req<any>(`/api/transcriptions/${encodeURIComponent(id)}`);
      if (r.status === 'completed') return { status: 'completed', provider: r.provider, transcript: r.transcript, utterances: r.utterances ?? [] };
      if (r.status === 'error') return { status: 'error', provider: r.provider, error: r.error ?? 'Transcription failed' };
      return { status: r.status, provider: r.provider };
    } catch (e) {
      if ((e as { status?: number })?.status === 410) return { status: 'expired', provider: '' };
      throw e;
    }
  }

  async deleteTranscription(id: string) {
    await this.req<void>(`/api/transcriptions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async extract(transcript: string, numApplicants: 1 | 2) {
    const r = await this.req<any>('/api/extractions', { method: 'POST', body: { transcript, numApplicants }, timeoutMs: 300_000 });
    // Re-normalise locally: never trust the shape of data crossing a network boundary.
    const proposal = normaliseExtraction(r?.proposal ? toRaw(r.proposal) : {}, numApplicants);
    const serverRejected = Array.isArray(r?.proposal?.rejected) ? r.proposal.rejected.slice(0, 500) : [];
    proposal.rejected = [...serverRejected, ...proposal.rejected];
    return { model: String(r.model), proposal };
  }
}

/** Convert a server proposal back into raw model shape so it can be re-validated locally. */
function toRaw(p: ExtractionProposal) {
  return {
    fields: (p.fields ?? []).map((f) => ({ path: f.path, value: f.value === null ? '' : String(f.value), confidence: f.confidence, evidence: f.evidence })),
    list_items: (p.listItems ?? []).map((l) => ({
      list: l.list,
      values: Object.entries(l.item ?? {}).map(([key, value]) => ({ key, value: String(value) })),
      confidence: l.confidence,
      evidence: l.evidence,
    })),
    summary: p.summary,
  };
}

/**
 * Works with no server at all. Returns the fictional sample meeting regardless
 * of what was recorded — clearly labelled "demo" everywhere it appears.
 */
export class OfflineDemoBackend implements Backend {
  readonly kind = 'offline-demo' as const;
  delayMs: number;
  private jobs = new Map<string, number>();
  constructor(delayMs = 2000) {
    this.delayMs = delayMs;
  }
  async health() {
    return { ok: true, mode: 'offline-demo', version: 'local', transcription: 'demo', extraction: 'demo' };
  }
  async login() {
    return { token: 'offline', expiresAt: new Date(Date.now() + 864e5).toISOString(), displayName: 'Demo Broker', mode: 'offline-demo' };
  }
  async me() {
    return { displayName: 'Demo Broker', mode: 'offline-demo' };
  }
  async startTranscription() {
    const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.jobs.set(id, Date.now());
    return { id, provider: 'demo' };
  }
  async getTranscription(id: string): Promise<TranscriptionStatus> {
    const t = this.jobs.get(id);
    if (t === undefined) return { status: 'error', provider: 'demo', error: 'Demo job lost (app restarted) — tap Transcribe again' };
    if (Date.now() - t < this.delayMs) return { status: 'processing', provider: 'demo' };
    return { status: 'completed', provider: 'demo', transcript: DEMO_TRANSCRIPT, utterances: DEMO_UTTERANCES };
  }
  async deleteTranscription(id: string) {
    this.jobs.delete(id);
  }
  async extract(_t: string, numApplicants: 1 | 2) {
    await new Promise((r) => setTimeout(r, Math.min(this.delayMs, 1500)));
    return { model: 'demo', proposal: normaliseExtraction(DEMO_EXTRACTION_RAW, numApplicants) };
  }
}
