/**
 * Validate .env and (in live mode) test both API keys with tiny, harmless requests.
 *   npm --workspace server run check-config
 * No client data is sent: AssemblyAI is asked for a non-existent transcript id;
 * Claude is sent a one-word prompt.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, loadDotEnv } from '../src/config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '.env'));

try {
  const cfg = loadConfig();
  console.log(`Mode: ${cfg.mode}`);
  for (const w of cfg.warnings) console.log(`WARNING: ${w}`);
  if (cfg.mode === 'demo') {
    console.log('Demo mode: no external services used. Config OK.');
    process.exit(0);
  }
  const aai = await fetch(`${cfg.assemblyAi.baseUrl}/v2/transcript/00000000-0000-0000-0000-000000000000`, { headers: { authorization: cfg.assemblyAi.apiKey } });
  console.log(`AssemblyAI (${cfg.assemblyAi.baseUrl}): ${aai.status === 401 ? 'KEY REJECTED (401)' : `reachable, key accepted (HTTP ${aai.status})`}`);
  const cl = await fetch(`${cfg.anthropic.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.anthropic.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.anthropic.model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with OK.' }] }),
  });
  const body = await cl.json().catch(() => ({}));
  console.log(`Claude (${cfg.anthropic.model}): ${cl.ok ? 'OK' : `FAILED (HTTP ${cl.status}: ${(body as any)?.error?.message ?? 'unknown'})`}`);
  process.exit(aai.status !== 401 && cl.ok ? 0 : 2);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
