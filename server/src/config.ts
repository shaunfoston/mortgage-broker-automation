import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type AiMode = 'demo' | 'live';

export interface Config {
  mode: AiMode;
  port: number;
  host: string;
  jwtSecret: Buffer;
  dataKey: Buffer;
  dataDir: string;
  maxAudioBytes: number;
  tokenTtlMs: number;
  trustProxy: boolean;
  assemblyAi: { apiKey: string; baseUrl: string; speechModels: string[] };
  anthropic: { apiKey: string; model: string; baseUrl: string };
  warnings: string[];
}

/** Minimal .env loader (KEY=VALUE, # comments). Real environment wins. */
export function loadDotEnv(file: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (env[m[1]] === undefined) env[m[1]] = v;
  }
}

function secret(name: string, raw: string | undefined, mode: AiMode, warnings: string[], errors: string[]): Buffer {
  if (raw && raw.length >= 32) return Buffer.from(raw, 'utf8');
  if (raw) errors.push(`${name} must be at least 32 characters`);
  if (mode === 'live') {
    if (!raw) errors.push(`${name} is required in live mode`);
    return Buffer.alloc(32);
  }
  warnings.push(`${name} not set — using a temporary random value (${name === 'JWT_SECRET' ? 'sign-ins' : 'uncollected transcripts'} are lost when the server restarts)`);
  return crypto.randomBytes(32);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Config {
  const warnings: string[] = [];
  const errors: string[] = [];
  const mode: AiMode = argv.includes('--demo') ? 'demo' : env.AI_MODE === 'live' ? 'live' : 'demo';
  const cfg: Config = {
    mode,
    port: Number(env.PORT ?? 3005),
    host: env.HOST ?? '0.0.0.0',
    jwtSecret: secret('JWT_SECRET', env.JWT_SECRET, mode, warnings, errors),
    dataKey: crypto.createHash('sha256').update(secret('DATA_KEY', env.DATA_KEY, mode, warnings, errors)).digest(),
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    maxAudioBytes: Number(env.MAX_AUDIO_MB ?? 200) * 1024 * 1024,
    tokenTtlMs: Number(env.TOKEN_TTL_HOURS ?? 12) * 3600_000,
    trustProxy: env.TRUST_PROXY === '1',
    assemblyAi: {
      apiKey: env.ASSEMBLYAI_API_KEY ?? '',
      baseUrl: (env.ASSEMBLYAI_BASE_URL || 'https://api.eu.assemblyai.com').replace(/\/$/, ''),
      speechModels: (env.ASSEMBLYAI_SPEECH_MODELS || 'universal-3-5-pro,universal-2').split(',').map((s) => s.trim()).filter(Boolean),
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      baseUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
    },
    warnings,
  };
  if (mode === 'live') {
    if (!cfg.assemblyAi.apiKey) errors.push('ASSEMBLYAI_API_KEY is required in live mode');
    if (!cfg.anthropic.apiKey) errors.push('ANTHROPIC_API_KEY is required in live mode');
    if (!cfg.assemblyAi.baseUrl.includes('.eu.')) warnings.push('ASSEMBLYAI_BASE_URL is not the EU endpoint — audio may be processed outside the UK/EU');
  }
  if (!Number.isInteger(cfg.port) || cfg.port <= 0) errors.push('PORT must be a positive integer');
  if (errors.length) throw new Error(`Configuration error:\n - ${errors.join('\n - ')}`);
  return cfg;
}
