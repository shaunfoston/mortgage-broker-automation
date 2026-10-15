import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { loadConfig } from '../src/config.ts';
import { Store } from '../src/store.ts';
import { DemoExtraction, DemoTranscription } from '../src/providers.ts';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/auth.ts';
import { DEMO_TRANSCRIPT } from '../../shared/src/demo.ts';
import { encryptExport } from '../../shared/src/secureExport.ts';
import { decryptExportFile } from '../scripts/decrypt-export.ts';

let base = '';
let app: ReturnType<typeof createApp>;
let store: Store;
let dataDir = '';

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-srv-'));
  const cfg = { ...loadConfig({ DATA_DIR: dataDir }, []), maxAudioBytes: 50_000 };
  store = new Store(dataDir, cfg.dataKey, ':memory:');
  store.createUser('broker1', 'Broker One', hashPassword('correct horse battery'));
  store.createUser('broker2', 'Broker Two', hashPassword('another long password'));
  app = createApp({ cfg, store, transcription: new DemoTranscription(0), extraction: new DemoExtraction(), log: () => undefined });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

after(() => {
  app.server.close();
  store.close();
});

async function login(username: string, password: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return { status: r.status, body: (await r.json()) as any };
}

const audio = (n = 5000) => new Uint8Array(n).fill(7);

test('health reports mode without secrets; security headers set', async () => {
  const r = await fetch(`${base}/health`);
  const b: any = await r.json();
  assert.equal(b.ok, true);
  assert.equal(b.mode, 'demo');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null, 'no CORS for browsers');
});

test('login: wrong password, lockout, success, me', async () => {
  assert.equal((await login('broker2', 'wrong password!!')).status, 401);
  assert.equal((await login('nobody', 'whatever password')).status, 401);
  for (let i = 0; i < 4; i++) await login('broker2', 'wrong password!!');
  const locked = await login('broker2', 'another long password');
  assert.equal(locked.status, 429, 'locked even with correct password after 5 failures');
  const ok = await login('BROKER1', 'correct horse battery');
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${ok.body.token}` } });
  assert.equal(((await me.json()) as any).user.displayName, 'Broker One');
  assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
  assert.equal((await fetch(`${base}/api/auth/me`, { headers: { authorization: 'Bearer abc.def.ghi' } })).status, 401);
});

test('transcription job lifecycle with ownership checks and purge', async () => {
  const { body } = await login('broker1', 'correct horse battery');
  const auth = { authorization: `Bearer ${body.token}` };

  assert.equal((await fetch(`${base}/api/transcriptions`, { method: 'POST', body: audio() })).status, 401);
  assert.equal((await fetch(`${base}/api/transcriptions`, { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: 'hi' })).status, 415);
  assert.equal((await fetch(`${base}/api/transcriptions`, { method: 'POST', headers: { ...auth, 'content-type': 'audio/mp4' }, body: audio(10) })).status, 400);
  assert.equal((await fetch(`${base}/api/transcriptions`, { method: 'POST', headers: { ...auth, 'content-type': 'audio/mp4' }, body: audio(60_000) })).status, 413);

  const up = await fetch(`${base}/api/transcriptions`, { method: 'POST', headers: { ...auth, 'content-type': 'audio/mp4' }, body: audio() });
  assert.equal(up.status, 202);
  const job: any = await up.json();
  await new Promise((r) => setTimeout(r, 50));
  await app.worker.tick();
  const got = await fetch(`${base}/api/transcriptions/${job.id}`, { headers: auth });
  const g: any = await got.json();
  assert.equal(g.status, 'completed');
  assert.match(g.transcript, /Jordan Alex Testwell/);
  assert.ok(g.utterances.length > 10);
  assert.equal(fs.readdirSync(path.join(dataDir, 'tmp')).length, 0, 'temp audio deleted');

  // Stored encrypted at rest.
  const raw: any = store.db.prepare('SELECT result FROM jobs WHERE id=?').get(job.id);
  assert.ok(!Buffer.from(raw.result).toString('latin1').includes('Testwell'));

  const other = await login('broker1', 'correct horse battery');
  void other;
  store.createUser('broker3', 'Broker Three', hashPassword('third long password'));
  const b3 = await login('broker3', 'third long password');
  assert.equal((await fetch(`${base}/api/transcriptions/${job.id}`, { headers: { authorization: `Bearer ${b3.body.token}` } })).status, 404, 'other brokers cannot read');

  assert.equal((await fetch(`${base}/api/transcriptions/${job.id}`, { method: 'DELETE', headers: auth })).status, 204);
  assert.equal((await fetch(`${base}/api/transcriptions/${job.id}`, { headers: auth })).status, 410);
  const audit = store.auditRows(50).map((r) => r.action);
  assert.ok(audit.includes('transcription.provider_deleted'));
  assert.ok(store.auditRows(200).every((r) => !String(r.details).includes('Testwell')), 'no personal data in server audit');
});

test('extraction endpoint returns a normalised proposal', async () => {
  const { body } = await login('broker1', 'correct horse battery');
  const h = { authorization: `Bearer ${body.token}`, 'content-type': 'application/json' };
  const r = await fetch(`${base}/api/extractions`, { method: 'POST', headers: h, body: JSON.stringify({ transcript: DEMO_TRANSCRIPT, numApplicants: 1 }) });
  assert.equal(r.status, 200);
  const x: any = await r.json();
  assert.equal(x.model, 'demo');
  assert.ok(x.proposal.fields.length > 30);
  assert.ok(x.proposal.rejected.length >= 1);
  assert.equal(x.proposal.fields.find((f: any) => f.path === 'a1.employment.basicSalary').value, 42500);
  assert.equal((await fetch(`${base}/api/extractions`, { method: 'POST', headers: h, body: JSON.stringify({ transcript: '' }) })).status, 400);
  assert.equal((await fetch(`${base}/api/extractions`, { method: 'POST', headers: h, body: '{bad' })).status, 400);
  assert.equal((await fetch(`${base}/api/nope`, { headers: h })).status, 404);
});

test('app export decrypts with the independent node:crypto tool', async () => {
  const payload = { case: { reference: 'MO-2026-0001' }, files: [{ name: 'a.pdf', base64: 'JVBERi0=' }] };
  const file = await encryptExport(payload, 'a long test passphrase', '2026-10-15T00:00:00Z', 20_000);
  assert.deepEqual(decryptExportFile(file, 'a long test passphrase'), payload);
  assert.throws(() => decryptExportFile(file, 'wrong passphrase here'), /Wrong passphrase/);
});
