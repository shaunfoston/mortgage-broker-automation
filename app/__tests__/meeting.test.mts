/**
 * App orchestration logic (record → transcribe → extract) exercised against
 * the real persistence layer and backends. Runs with node:test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb } from '../../shared/test/nodeAdapter.ts';
import { migrate } from '../../shared/src/db/migrations.ts';
import { Repo } from '../../shared/src/db/repo.ts';
import { OfflineDemoBackend, type Backend } from '../../shared/src/apiClient.ts';
import { pollTranscription, runExtraction, startTranscription } from '../src/lib/meeting.ts';

async function setup() {
  const db = openNodeDb();
  await migrate(db);
  const repo = new Repo(db, { actor: () => 'Test Broker' });
  const c = await repo.createClient({ firstName: 'Jordan', lastName: 'Testwell' });
  const k = await repo.createCase(c.id);
  const rec = await repo.createRecording({ caseId: k.id, fileUri: 'file:///r.m4a', mime: 'audio/mp4', durationMs: 1000, sizeBytes: 5000, consentConfirmedAt: new Date().toISOString() });
  return { db, repo, k, rec };
}

test('offline demo: transcribe, poll, extract, review proposals stored', async () => {
  const { db, repo, k, rec } = await setup();
  const backend = new OfflineDemoBackend(0);
  await startTranscription(repo, backend, rec);
  let r = (await repo.getRecording(rec.id))!;
  assert.equal(r.status, 'processing');
  assert.equal(await pollTranscription(repo, backend, r), true);
  r = (await repo.getRecording(rec.id))!;
  assert.equal(r.status, 'transcribed');
  assert.ok(r.utterances.length > 10);
  const exId = await runExtraction(repo, backend, r);
  const ex = (await repo.getExtraction(exId))!;
  assert.ok(ex.items.length > 30);
  assert.equal((await repo.getCase(k.id))!.status, 'AI review');
  db.close();
});

function fakeBackend(over: Partial<Backend>): Backend {
  return { ...new OfflineDemoBackend(0), kind: 'server', ...over } as Backend;
}

test('provider error and expiry mark the recording failed with a clear message', async () => {
  const { db, repo, rec } = await setup();
  const failing = fakeBackend({
    startTranscription: async () => ({ id: 'j1', provider: 'assemblyai-eu' }),
    getTranscription: async () => ({ status: 'error', provider: 'assemblyai-eu', error: 'Audio file is corrupt' }),
  });
  await startTranscription(repo, failing, rec);
  assert.equal(await pollTranscription(repo, failing, (await repo.getRecording(rec.id))!), true);
  let r = (await repo.getRecording(rec.id))!;
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'Audio file is corrupt');

  const expiring = fakeBackend({
    startTranscription: async () => ({ id: 'j2', provider: 'assemblyai-eu' }),
    getTranscription: async () => ({ status: 'expired', provider: '' }),
  });
  await startTranscription(repo, expiring, r);
  await pollTranscription(repo, expiring, (await repo.getRecording(rec.id))!);
  r = (await repo.getRecording(rec.id))!;
  assert.match(r.error!, /expired/);

  const pending = fakeBackend({
    startTranscription: async () => ({ id: 'j3', provider: 'x' }),
    getTranscription: async () => ({ status: 'processing', provider: 'x' }),
  });
  await startTranscription(repo, pending, r);
  assert.equal(await pollTranscription(repo, pending, (await repo.getRecording(rec.id))!), false, 'keeps polling');
  db.close();
});

test('cannot transcribe once the audio has been deleted; cannot extract without transcript', async () => {
  const { db, repo, rec } = await setup();
  await repo.clearRecordingAudio(rec.id);
  const r = (await repo.getRecording(rec.id))!;
  await assert.rejects(startTranscription(repo, new OfflineDemoBackend(0), r), /no longer on the device/);
  await assert.rejects(runExtraction(repo, new OfflineDemoBackend(0), r), /No transcript/);
  db.close();
});
