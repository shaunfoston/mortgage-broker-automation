import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AnthropicExtraction, AssemblyAiTranscription, ProviderError } from '../src/providers.ts';
import { DEMO_EXTRACTION_RAW, DEMO_TRANSCRIPT } from '../../shared/src/demo.ts';

type Call = { url: string; init: any };

function mockFetch(responses: ((c: Call) => { status: number; body: unknown })[]) {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string, init: any) => {
    const c = { url, init };
    calls.push(c);
    const r = responses[Math.min(i++, responses.length - 1)](c);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('AssemblyAI: upload → transcript request uses EU endpoint, diarisation, documented models', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aai-')), 'a.m4a');
  fs.writeFileSync(f, Buffer.alloc(4000, 1));
  const { fn, calls } = mockFetch([
    () => ({ status: 200, body: { upload_url: 'https://cdn.example/u1' } }),
    () => ({ status: 200, body: { id: 'tx1', status: 'queued' } }),
  ]);
  const p = new AssemblyAiTranscription({ apiKey: 'KEY', baseUrl: 'https://api.eu.assemblyai.com', speechModels: ['universal-3-5-pro', 'universal-2'] }, fn);
  assert.equal(p.name, 'assemblyai-eu');
  assert.equal(await p.start(f, 'audio/mp4'), 'tx1');
  assert.equal(calls[0].url, 'https://api.eu.assemblyai.com/v2/upload');
  assert.equal(calls[0].init.headers.authorization, 'KEY');
  assert.equal(calls[0].init.body.length, 4000);
  assert.equal(calls[1].url, 'https://api.eu.assemblyai.com/v2/transcript');
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual(body, { audio_url: 'https://cdn.example/u1', speech_models: ['universal-3-5-pro', 'universal-2'], language_detection: true, speaker_labels: true });
});

test('AssemblyAI: poll maps utterances; errors; delete', async () => {
  const { fn, calls } = mockFetch([
    () => ({ status: 200, body: { status: 'processing' } }),
    () => ({ status: 200, body: { status: 'completed', text: 'Hello there', utterances: [{ speaker: 'A', text: 'Hello', start: 10, end: 500 }, { speaker: 'B', text: 'there', start: 600, end: 900 }] } }),
    () => ({ status: 200, body: { status: 'error', error: 'Audio file is corrupt' } }),
    () => ({ status: 200, body: { status: 'completed' } }),
  ]);
  const p = new AssemblyAiTranscription({ apiKey: 'K', baseUrl: 'https://api.eu.assemblyai.com', speechModels: ['x'] }, fn);
  assert.deepEqual(await p.poll('tx1'), { status: 'processing' });
  const done = await p.poll('tx1');
  assert.equal(done.status, 'completed');
  assert.equal((done as any).utterances[1].speaker, 'B');
  assert.deepEqual(await p.poll('tx1'), { status: 'error', error: 'Audio file is corrupt' });
  await p.cleanup('tx1');
  assert.equal(calls.at(-1)!.init.method, 'DELETE');
  assert.equal(calls.at(-1)!.url, 'https://api.eu.assemblyai.com/v2/transcript/tx1');
});

test('AssemblyAI: retries 503 then succeeds; 401 surfaces without leaking key', async () => {
  const { fn, calls } = mockFetch([() => ({ status: 503, body: { error: 'busy' } }), () => ({ status: 200, body: { status: 'processing' } })]);
  const p = new AssemblyAiTranscription({ apiKey: 'SECRETKEY', baseUrl: 'https://api.eu.assemblyai.com', speechModels: ['x'] }, fn);
  assert.deepEqual(await p.poll('t'), { status: 'processing' });
  assert.equal(calls.length, 2);
  const bad = mockFetch([() => ({ status: 401, body: { error: 'Invalid API key' } })]);
  const p2 = new AssemblyAiTranscription({ apiKey: 'SECRETKEY', baseUrl: 'https://api.eu.assemblyai.com', speechModels: ['x'] }, bad.fn);
  await assert.rejects(p2.poll('t'), (e: any) => e instanceof ProviderError && !e.message.includes('SECRETKEY'));
  assert.equal(bad.calls.length, 1, '401 is not retried');
});

test('Claude: request uses Messages API with structured outputs; response parsed', async () => {
  const { fn, calls } = mockFetch([
    () => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(DEMO_EXTRACTION_RAW) }] } }),
  ]);
  const p = new AnthropicExtraction({ apiKey: 'sk-ant', model: 'claude-sonnet-5-5', baseUrl: 'https://api.anthropic.com' }, fn);
  const out: any = await p.extract(DEMO_TRANSCRIPT, 1);
  assert.equal(out.fields.length, DEMO_EXTRACTION_RAW.fields.length);
  const c = calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.headers['x-api-key'], 'sk-ant');
  assert.equal(c.init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(c.init.body);
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.output_config.format.schema.additionalProperties, false);
  assert.ok(!('output_format' in body), 'deprecated parameter not used');
  assert.match(body.messages[0].content, /<transcript>/);
  assert.equal(typeof body.messages[0].content, 'string', 'text only — no audio content blocks');
});

test('Claude: retries 529, handles refusal, max_tokens and bad JSON', async () => {
  const seq = mockFetch([
    () => ({ status: 529, body: { error: { message: 'overloaded' } } }),
    () => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"fields":[],"list_items":[],"summary":{}}' }] } }),
  ]);
  const p = new AnthropicExtraction({ apiKey: 'k', model: 'm', baseUrl: 'https://api.anthropic.com' }, seq.fn);
  assert.deepEqual(await p.extract('x'.repeat(50), 1), { fields: [], list_items: [], summary: {} });
  assert.equal(seq.calls.length, 2);
  for (const [body, re] of [
    [{ stop_reason: 'refusal', content: [] }, /declined/],
    [{ stop_reason: 'max_tokens', content: [] }, /too long/],
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }, /invalid JSON/],
  ] as const) {
    const m = mockFetch([() => ({ status: 200, body })]);
    await assert.rejects(new AnthropicExtraction({ apiKey: 'k', model: 'm', baseUrl: 'https://api.anthropic.com' }, m.fn).extract('x'.repeat(50), 1), re);
  }
  const bad = mockFetch([() => ({ status: 400, body: { error: { message: 'invalid schema' } } })]);
  await assert.rejects(new AnthropicExtraction({ apiKey: 'k', model: 'm', baseUrl: 'https://api.anthropic.com' }, bad.fn).extract('x'.repeat(50), 1), /400: invalid schema/);
  assert.equal(bad.calls.length, 1);
});
