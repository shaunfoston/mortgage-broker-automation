import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Config } from './config.ts';
import type { Store, User } from './store.ts';
import { DUMMY_HASH, RateLimiter, signToken, verifyPassword, verifyToken } from './auth.ts';
import { ProviderError, type ExtractionProvider, type TranscriptionProvider, type Utterance } from './providers.ts';
import { normaliseExtraction } from '../../shared/src/extraction.ts';

export const VERSION = '0.4.0';

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

type Req = http.IncomingMessage;
type Res = http.ServerResponse;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'strict-transport-security': 'max-age=31536000',
};

function send(res: Res, status: number, body?: unknown) {
  if (res.headersSent) return;
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }) });
  res.end(payload);
}

async function readJson(req: Req, limit: number): Promise<any> {
  const ct = String(req.headers['content-type'] ?? '');
  if (!ct.startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type', 'Send JSON');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'payload_too_large');
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

async function streamToFile(req: Req, file: string, limit: number): Promise<number> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'payload_too_large', `Audio exceeds ${Math.round(limit / 1048576)} MB`);
  const out = fs.createWriteStream(file, { mode: 0o600 });
  let size = 0;
  try {
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > limit) throw new HttpError(413, 'payload_too_large', `Audio exceeds ${Math.round(limit / 1048576)} MB`);
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  return size;
}

export interface AppDeps {
  cfg: Config;
  store: Store;
  transcription: TranscriptionProvider;
  extraction: ExtractionProvider;
  log?: (msg: string) => void;
}

export function createApp(deps: AppDeps) {
  const { cfg, store, transcription, extraction } = deps;
  const log = deps.log ?? ((m: string) => console.log(`${new Date().toISOString()} ${m}`));
  const tmpDir = path.join(cfg.dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const loginByIp = new RateLimiter(30, 15 * 60_000);
  const loginFailsByUser = new RateLimiter(5, 15 * 60_000);
  const apiByUser = new RateLimiter(600, 60 * 60_000);
  const extractByUser = new RateLimiter(60, 60 * 60_000);
  const pollErrors = new Map<string, number>();

  const ipOf = (req: Req) => {
    if (cfg.trustProxy) {
      const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
      if (xf) return xf;
    }
    return req.socket.remoteAddress ?? 'unknown';
  };

  function authed(req: Req): User {
    const h = String(req.headers.authorization ?? '');
    const m = h.match(/^Bearer (.+)$/);
    if (!m) throw new HttpError(401, 'unauthorised', 'Sign in required');
    const claims = verifyToken(m[1], cfg.jwtSecret);
    if (!claims) throw new HttpError(401, 'unauthorised', 'Session expired — sign in again');
    const u = store.userById(claims.sub);
    if (!u || u.disabled) throw new HttpError(401, 'unauthorised', 'Account unavailable');
    const wait = apiByUser.hit(u.id);
    if (wait) throw new HttpError(429, 'rate_limited', 'Too many requests');
    return u;
  }

  async function startProviderJob(jobId: string, file: string, mime: string) {
    try {
      store.updateJob(jobId, { status: 'processing' });
      const providerJobId = await transcription.start(file, mime);
      store.updateJob(jobId, { providerJobId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload to transcription service failed';
      store.updateJob(jobId, { status: 'error', error: msg.slice(0, 300) });
      log(`job ${jobId} start failed: ${msg}`);
    } finally {
      fs.rm(file, { force: true }, () => undefined);
    }
  }

  /** Poll the provider for each active job. Called by the interval worker (and tests). */
  async function tick() {
    for (const job of store.activeJobs()) {
      if (!job.providerJobId) {
        if (Date.now() - Date.parse(job.updatedAt) > 15 * 60_000) store.updateJob(job.id, { status: 'error', error: 'Upload did not complete' });
        continue;
      }
      try {
        const r = await transcription.poll(job.providerJobId);
        pollErrors.delete(job.id);
        if (r.status === 'completed') {
          store.setJobResult(job.id, { transcript: r.text, utterances: r.utterances });
          store.audit('transcription.completed', job.userId, null, { job: job.id, utterances: r.utterances.length });
          await transcription.cleanup(job.providerJobId);
          store.audit('transcription.provider_deleted', job.userId, null, { job: job.id });
        } else if (r.status === 'error') {
          store.updateJob(job.id, { status: 'error', error: r.error.slice(0, 300) });
          await transcription.cleanup(job.providerJobId);
        }
      } catch (e) {
        const n = (pollErrors.get(job.id) ?? 0) + 1;
        pollErrors.set(job.id, n);
        if (n >= 10) store.updateJob(job.id, { status: 'error', error: 'Transcription service unreachable' });
        log(`job ${job.id} poll error ${n}: ${(e as Error).message}`);
      }
    }
  }

  async function route(req: Req, res: Res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const p = url.pathname;
    const method = req.method ?? 'GET';
    const ip = ipOf(req);

    if (method === 'GET' && p === '/health') {
      return send(res, 200, { ok: true, service: 'mortgage-options', version: VERSION, mode: cfg.mode, transcription: transcription.name, extraction: `${extraction.name}:${extraction.model}` });
    }

    if (method === 'POST' && p === '/api/auth/login') {
      if (loginByIp.hit(ip)) throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again later.');
      const body = await readJson(req, 10_000);
      const username = String(body.username ?? '').trim().toLowerCase().slice(0, 100);
      const password = String(body.password ?? '');
      if (loginFailsByUser.check(username)) {
        store.audit('auth.locked', null, ip, { username });
        throw new HttpError(429, 'locked', 'Account temporarily locked after failed attempts. Try again in 15 minutes.');
      }
      const user = store.userByName(username);
      const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH) && !!user && !user.disabled;
      if (!ok) {
        loginFailsByUser.hit(username);
        store.audit('auth.failed', user?.id ?? null, ip, {});
        throw new HttpError(401, 'invalid_credentials', 'Username or password is incorrect');
      }
      loginFailsByUser.reset(username);
      const t = signToken({ sub: user.id, name: user.displayName }, cfg.jwtSecret, cfg.tokenTtlMs);
      store.audit('auth.login', user.id, ip, {});
      return send(res, 200, { token: t.token, expiresAt: t.expiresAt, user: { username: user.username, displayName: user.displayName, role: user.role }, mode: cfg.mode });
    }

    if (method === 'GET' && p === '/api/auth/me') {
      const u = authed(req);
      return send(res, 200, { user: { username: u.username, displayName: u.displayName, role: u.role }, mode: cfg.mode });
    }

    if (method === 'POST' && p === '/api/transcriptions') {
      const u = authed(req);
      const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!/^audio\/[a-z0-9.+-]+$/.test(mime) && mime !== 'application/octet-stream') throw new HttpError(415, 'unsupported_media_type', 'Send audio (e.g. audio/mp4)');
      const job = store.createJob(u.id, transcription.name);
      const file = path.join(tmpDir, `${job.id}.audio`);
      let size: number;
      try {
        size = await streamToFile(req, file, cfg.maxAudioBytes);
      } catch (e) {
        fs.rm(file, { force: true }, () => undefined);
        store.updateJob(job.id, { status: 'error', error: 'Upload failed' });
        throw e;
      }
      if (size < 1000) {
        fs.rm(file, { force: true }, () => undefined);
        store.updateJob(job.id, { status: 'error', error: 'Audio too short' });
        throw new HttpError(400, 'audio_too_short', 'The recording is empty or too short');
      }
      store.audit('transcription.requested', u.id, ip, { job: job.id, bytes: size, mime });
      void startProviderJob(job.id, file, mime);
      return send(res, 202, { id: job.id, status: 'queued', provider: transcription.name });
    }

    const tm = p.match(/^\/api\/transcriptions\/([0-9a-f-]{36})$/);
    if (tm) {
      const u = authed(req);
      const job = store.getJob(tm[1]);
      if (!job || job.userId !== u.id) throw new HttpError(404, 'not_found');
      if (method === 'GET') {
        if (job.status === 'completed') {
          const r = store.getJobResult<{ transcript: string; utterances: Utterance[] }>(job.id);
          if (!r) return send(res, 410, { error: 'expired', message: 'Transcript already collected or expired' });
          return send(res, 200, { id: job.id, status: job.status, provider: job.provider, ...r });
        }
        return send(res, 200, { id: job.id, status: job.status, provider: job.provider, error: job.error });
      }
      if (method === 'DELETE') {
        store.purgeJobResult(job.id);
        store.audit('transcription.collected', u.id, ip, { job: job.id });
        return send(res, 204);
      }
    }

    if (method === 'POST' && p === '/api/extractions') {
      const u = authed(req);
      if (extractByUser.hit(u.id)) throw new HttpError(429, 'rate_limited', 'Extraction limit reached — try again later');
      const body = await readJson(req, 2_000_000);
      const transcript = String(body.transcript ?? '');
      const numApplicants = body.numApplicants === 2 ? 2 : 1;
      if (transcript.trim().length < 20) throw new HttpError(400, 'transcript_required', 'Transcript is empty');
      if (transcript.length > 600_000) throw new HttpError(413, 'transcript_too_long', 'Transcript too long');
      const started = Date.now();
      const raw = await extraction.extract(transcript, numApplicants);
      const proposal = normaliseExtraction(raw, numApplicants);
      store.audit('extraction.completed', u.id, ip, {
        model: extraction.model, ms: Date.now() - started, fields: proposal.fields.length, listItems: proposal.listItems.length, rejected: proposal.rejected.length,
      });
      return send(res, 200, { provider: extraction.name, model: extraction.model, proposal });
    }

    throw new HttpError(404, 'not_found');
  }

  const server = http.createServer((req, res) => {
    const reqId = crypto.randomUUID().slice(0, 8);
    const t0 = Date.now();
    res.on('finish', () => log(`${reqId} ${req.method} ${(req.url ?? '').split('?')[0]} ${res.statusCode} ${Date.now() - t0}ms`));
    route(req, res).catch((e) => {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message });
      if (e instanceof ProviderError) {
        log(`${reqId} provider error: ${e.message}`);
        return send(res, e.status, { error: 'provider_error', message: e.message });
      }
      log(`${reqId} unhandled: ${(e as Error)?.stack ?? e}`);
      send(res, 500, { error: 'internal_error', message: 'Something went wrong' });
    });
  });
  server.requestTimeout = 15 * 60_000;
  server.headersTimeout = 60_000;

  let timer: NodeJS.Timeout | null = null;
  let sweeper: NodeJS.Timeout | null = null;
  let ticking = false;
  const worker = {
    tick,
    start(intervalMs = 3000) {
      timer = setInterval(async () => {
        if (ticking) return;
        ticking = true;
        try {
          await tick();
        } finally {
          ticking = false;
        }
      }, intervalMs);
      sweeper = setInterval(() => {
        const n = store.purgeExpired();
        if (n) log(`purged ${n} expired transcript(s)`);
      }, 10 * 60_000);
    },
    stop() {
      if (timer) clearInterval(timer);
      if (sweeper) clearInterval(sweeper);
    },
  };
  return { server, worker };
}
