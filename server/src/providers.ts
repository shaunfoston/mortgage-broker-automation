import fs from 'node:fs';
import type { Config } from './config.ts';
import { DEMO_EXTRACTION_RAW, DEMO_TRANSCRIPT, DEMO_UTTERANCES } from '../../shared/src/demo.ts';
import { extractionJsonSchema, extractionSystemPrompt, extractionUserPrompt } from '../../shared/src/extraction.ts';

export interface Utterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export type PollResult =
  | { status: 'processing' }
  | { status: 'completed'; text: string; utterances: Utterance[] }
  | { status: 'error'; error: string };

export interface TranscriptionProvider {
  name: string;
  start(filePath: string, mime: string): Promise<string>;
  poll(providerJobId: string): Promise<PollResult>;
  /** Delete audio + transcript from the provider. Must not throw. */
  cleanup(providerJobId: string): Promise<void>;
}

export interface ExtractionProvider {
  name: string;
  model: string;
  extract(transcript: string, numApplicants: 1 | 2): Promise<unknown>;
}

export class ProviderError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status = 502, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

type FetchFn = typeof fetch;

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 800): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!(e instanceof ProviderError) || !e.retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

function retryableStatus(s: number) {
  return s === 429 || s === 529 || s >= 500;
}

// ───────────────────────────── Demo (no external calls) ─────────────────────────────

export class DemoTranscription implements TranscriptionProvider {
  name = 'demo';
  delayMs: number;
  private started = new Map<string, number>();
  constructor(delayMs = 2500) {
    this.delayMs = delayMs;
  }
  async start(): Promise<string> {
    const id = `demo-${Math.random().toString(36).slice(2)}`;
    this.started.set(id, Date.now());
    return id;
  }
  async poll(id: string): Promise<PollResult> {
    const t = this.started.get(id);
    if (t === undefined) return { status: 'error', error: 'Unknown demo job' };
    if (Date.now() - t < this.delayMs) return { status: 'processing' };
    return { status: 'completed', text: DEMO_TRANSCRIPT, utterances: DEMO_UTTERANCES };
  }
  async cleanup(id: string) {
    this.started.delete(id);
  }
}

export class DemoExtraction implements ExtractionProvider {
  name = 'demo';
  model = 'demo';
  async extract(transcript: string): Promise<unknown> {
    if (transcript.includes('Jordan Alex Testwell')) return DEMO_EXTRACTION_RAW;
    return {
      fields: [],
      list_items: [],
      summary: {
        overview: 'Demo mode: AI extraction is simulated and only recognises the built-in sample meeting.',
        client_objectives: [], key_facts: [], concerns_or_risks: [], action_items: [], possible_vulnerability_indicators: [],
        missing_information: ['Switch the server to AI_MODE=live for real extraction'],
      },
    };
  }
}

// ───────────────────────────── AssemblyAI ─────────────────────────────

export class AssemblyAiTranscription implements TranscriptionProvider {
  name = 'assemblyai-eu';
  cfg: Config['assemblyAi'];
  fetch: FetchFn;
  constructor(cfg: Config['assemblyAi'], fetchFn: FetchFn = fetch) {
    this.cfg = cfg;
    this.fetch = fetchFn;
    if (!cfg.baseUrl.includes('.eu.')) this.name = 'assemblyai';
  }

  private async call(path: string, init: RequestInit & { duplex?: 'half' }, timeoutMs = 60_000): Promise<any> {
    const res = await this.fetch(`${this.cfg.baseUrl}${path}`, {
      ...init,
      headers: { authorization: this.cfg.apiKey, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) throw new ProviderError(`AssemblyAI ${res.status}: ${body?.error ?? 'request failed'}`, res.status === 401 ? 502 : 502, retryableStatus(res.status));
    return body;
  }

  async start(filePath: string, _mime?: string): Promise<string> {
    const size = fs.statSync(filePath).size;
    // Upload is not retried with a consumed stream: read once into memory per attempt (meeting audio is tens of MB at most).
    const upload = await withRetry(() =>
      this.call('/v2/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) }, body: fs.readFileSync(filePath) }, 300_000),
    );
    if (!upload?.upload_url) throw new ProviderError('AssemblyAI upload returned no URL');
    const job = await withRetry(() =>
      this.call('/v2/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload.upload_url, speech_models: this.cfg.speechModels, language_detection: true, speaker_labels: true }),
      }),
    );
    if (!job?.id) throw new ProviderError('AssemblyAI returned no transcript id');
    return String(job.id);
  }

  async poll(id: string): Promise<PollResult> {
    const r = await withRetry(() => this.call(`/v2/transcript/${encodeURIComponent(id)}`, { method: 'GET' }));
    if (r?.status === 'completed') {
      const utterances: Utterance[] = Array.isArray(r.utterances)
        ? r.utterances.map((u: any) => ({ speaker: String(u.speaker ?? '?'), text: String(u.text ?? ''), start: Number(u.start ?? 0), end: Number(u.end ?? 0) }))
        : [{ speaker: 'A', text: String(r.text ?? ''), start: 0, end: 0 }];
      return { status: 'completed', text: String(r.text ?? ''), utterances };
    }
    if (r?.status === 'error') return { status: 'error', error: String(r.error ?? 'Transcription failed') };
    return { status: 'processing' };
  }

  async cleanup(id: string) {
    try {
      await this.call(`/v2/transcript/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      /* best effort; logged by caller */
    }
  }
}

// ───────────────────────────── Anthropic (Claude) ─────────────────────────────

export class AnthropicExtraction implements ExtractionProvider {
  name = 'anthropic';
  cfg: Config['anthropic'];
  model: string;
  fetch: FetchFn;
  constructor(cfg: Config['anthropic'], fetchFn: FetchFn = fetch) {
    this.cfg = cfg;
    this.model = cfg.model;
    this.fetch = fetchFn;
  }

  /** Build the Messages API request body (exported for tests). */
  body(transcript: string, numApplicants: 1 | 2) {
    return {
      model: this.cfg.model,
      max_tokens: 16000,
      system: extractionSystemPrompt(),
      messages: [{ role: 'user', content: extractionUserPrompt(transcript, numApplicants) }],
      output_config: { format: { type: 'json_schema', schema: extractionJsonSchema(numApplicants) } },
    };
  }

  async extract(transcript: string, numApplicants: 1 | 2): Promise<unknown> {
    const res = await withRetry(async () => {
      const r = await this.fetch(`${this.cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(this.body(transcript, numApplicants)),
        signal: AbortSignal.timeout(240_000),
      });
      const text = await r.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!r.ok) throw new ProviderError(`Claude API ${r.status}: ${json?.error?.message ?? 'request failed'}`, 502, retryableStatus(r.status));
      return json;
    });
    if (res?.stop_reason === 'refusal') throw new ProviderError('Claude declined to process this transcript', 422);
    if (res?.stop_reason === 'max_tokens') throw new ProviderError('Transcript too long for a single extraction', 422);
    const text = (res?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new ProviderError('Claude returned invalid JSON', 502);
    }
  }
}

export function makeProviders(cfg: Config): { transcription: TranscriptionProvider; extraction: ExtractionProvider } {
  if (cfg.mode === 'demo') return { transcription: new DemoTranscription(), extraction: new DemoExtraction() };
  return { transcription: new AssemblyAiTranscription(cfg.assemblyAi), extraction: new AnthropicExtraction(cfg.anthropic) };
}
