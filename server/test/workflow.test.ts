/**
 * Full broker workflow, end to end, against the real HTTP server (demo
 * providers) and the app's real persistence layer on a SQLite file:
 * create fictional client → fact-find → record → transcribe → review AI →
 * sign consent → save → close & reopen → generate PDFs → encrypted export.
 * Mirrors the "definition of success" minus the phone UI itself.
 */
import { test } from 'node:test';
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
import { decryptExportFile } from '../scripts/decrypt-export.ts';
import { openNodeDb } from '../../shared/test/nodeAdapter.ts';
import { migrate } from '../../shared/src/db/migrations.ts';
import { Repo } from '../../shared/src/db/repo.ts';
import { ServerBackend, OfflineDemoBackend, type UploadFn } from '../../shared/src/apiClient.ts';
import { getValue, overallProgress, computeMetrics } from '../../shared/src/factfind/model.ts';
import { strokesToDataUrl } from '../../shared/src/signature.ts';
import { consentHtml, factFindHtml, meetingSummaryHtml, auditHtml } from '../../shared/src/pdf/templates.ts';
import { encryptExport } from '../../shared/src/secureExport.ts';
import { DEMO_CLIENTS } from '../../shared/src/demo.ts';

const nodeUpload: UploadFn = async (url, fileUri, headers) => {
  const r = await fetch(url, { method: 'POST', headers, body: fs.readFileSync(new URL(fileUri)) });
  return { status: r.status, body: await r.text() };
};

async function waitFor<T>(fn: () => Promise<T | null>, tick: () => Promise<void>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await tick();
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
}

test('definition-of-success workflow (server mode)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-flow-'));
  const cfg = { ...loadConfig({ DATA_DIR: dir }, []) };
  const store = new Store(dir, cfg.dataKey, ':memory:');
  store.createUser('alan', 'Alan Broker', hashPassword('a long broker password'));
  const { server, worker } = createApp({ cfg, store, transcription: new DemoTranscription(0), extraction: new DemoExtraction(), log: () => undefined });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const dbFile = path.join(dir, 'device.db');
  let db = openNodeDb(dbFile);
  await migrate(db);
  let repo = new Repo(db, { actor: () => 'Alan Broker' });

  try {
    // Sign in.
    const api = new ServerBackend(base, null, fetch, nodeUpload);
    await assert.rejects(api.login('alan', 'wrong password!!'), /incorrect/);
    const session = await api.login('alan', 'a long broker password');
    assert.equal(session.displayName, 'Alan Broker');

    // 1. Create fictional client + case.
    const d = DEMO_CLIENTS[0];
    const client = await repo.createClient({ ...d, isDemo: true });
    const kase = await repo.createCase(client.id, { purpose: d.purpose });

    // 2. Complete part of the fact-find by hand.
    await repo.saveSection(kase.id, 'a1', 'contact', { currentAddress: '12 Example Road, Testville', postcode: 'zz993zz', mobile: '07700 900123' });
    await repo.saveList(kase.id, 'a1', 'addressHistory', [{ address: '3 Old Lane, Testville', postcode: 'ZZ99 1ZZ', from: '01/01/2018', to: '31/05/2021' }]);

    // 3. Record (fake audio file) and transcribe via the server.
    const audioPath = path.join(dir, 'meeting.m4a');
    fs.writeFileSync(audioPath, Buffer.alloc(48_000, 3));
    const rec = await repo.createRecording({
      caseId: kase.id, fileUri: `file://${audioPath}`, mime: 'audio/mp4', durationMs: 240_000, sizeBytes: 48_000, consentConfirmedAt: new Date().toISOString(),
    });
    const job = await api.startTranscription(rec.fileUri!, 'audio/mp4');
    await repo.markTranscriptionStarted(rec.id, job.id, job.provider);
    const done = await waitFor(async () => {
      const s = await api.getTranscription(job.id);
      return s.status === 'completed' ? s : null;
    }, () => worker.tick());
    await repo.setTranscript(rec.id, done.transcript, done.utterances);
    await api.deleteTranscription(job.id);
    assert.equal((await api.getTranscription(job.id)).status, 'expired', 'server copy purged');

    // 4. AI extraction + broker review.
    const { model, proposal } = await api.extract(done.transcript, 1);
    assert.equal(model, 'demo');
    assert.ok(proposal.rejected.length >= 1, 'server-side rejections preserved');
    const ex = await repo.createExtraction(kase.id, rec.id, proposal, model);
    await repo.acceptAllAbove(ex.id, 0.85);
    const medium = (await repo.getExtraction(ex.id))!.items.filter((i) => i.decision === 'pending');
    for (const it of medium) await repo.decideItem(it.id, it.path === 'case.deposit.amount' ? 'edited' : 'accepted', it.path === 'case.deposit.amount' ? '30000' : undefined);
    assert.equal((await repo.getExtraction(ex.id))!.status, 'reviewed');

    // 5. Consent + signature.
    const sig = strokesToDataUrl([[[10, 60], [60, 20], [110, 70], [160, 25], [220, 65], [280, 30]]], 320, 120);
    const consent = await repo.saveConsent({
      caseId: kase.id, applicantIndex: 1, signerName: 'Jordan Testwell', answers: { privacyNotice: true, processing: true, recording: true, specialCategory: false, marketing: false },
      signatureDataUrl: sig, signedAt: new Date(), timeZone: 'Europe/London', device: 'workflow-test',
    });

    // 6. Close and reopen the "app" — all data persists.
    db.close();
    db = openNodeDb(dbFile);
    await migrate(db);
    repo = new Repo(db, { actor: () => 'Alan Broker' });
    const c = (await repo.getCase(kase.id))!;
    assert.equal(c.status, 'Consent signed');
    assert.equal(getValue(c.factFind, 'a1.contact.postcode'), 'ZZ99 3ZZ', 'manual value kept');
    assert.equal(getValue(c.factFind, 'a1.employment.basicSalary'), 42500, 'AI value accepted');
    assert.equal(getValue(c.factFind, 'case.deposit.amount'), 30000, 'edited AI value');
    assert.equal(c.provenance['a1.contact.postcode'].source, 'manual');
    const m = computeMetrics(c.factFind);
    assert.equal(m.ltvPercent, 89.5);
    assert.ok(overallProgress(c.factFind).percent >= 50);
    const consents = await repo.listConsents(kase.id);
    assert.equal(consents[0].id, consent.id);
    assert.ok(repo.verifyConsent(consents[0]));
    assert.equal((await repo.verifyAudit()).ok, true);

    // 7. PDFs (HTML that expo-print renders) + encrypted export.
    const now = new Date().toISOString();
    const recs = await repo.listRecordings(kase.id);
    const exs = await repo.listExtractions(kase.id);
    const htmls = {
      factfind: factFindHtml({ client: await repo.getClient(client.id), caseRec: c, generatedAt: now, generatedBy: 'Alan Broker' }),
      summary: meetingSummaryHtml({ client: null, caseRec: c, recording: recs[0], extraction: exs[0], generatedAt: now, generatedBy: 'Alan Broker' }),
      consent: consentHtml({ client: null, caseRec: c, consent: consents[0], verified: true, generatedAt: now, generatedBy: 'Alan Broker' }),
      audit: auditHtml({ client: null, caseRec: c, entries: (await repo.listAudit(kase.id)).reverse(), chainOk: true, generatedAt: now, generatedBy: 'Alan Broker' }),
    };
    assert.match(htmls.factfind, /£42,500<span class="ai">AI<\/span>/);
    assert.match(htmls.summary, /Recent bereavement/);
    assert.match(htmls.consent, /data:image\/svg\+xml;base64/);
    fs.mkdirSync(path.join(dir, 'pdf-html'), { recursive: true });
    for (const [k, v] of Object.entries(htmls)) fs.writeFileSync(path.join(dir, 'pdf-html', `${k}.html`), v);
    if (process.env.MO_SAMPLE_OUT) {
      fs.mkdirSync(process.env.MO_SAMPLE_OUT, { recursive: true });
      for (const [k, v] of Object.entries(htmls)) fs.writeFileSync(path.join(process.env.MO_SAMPLE_OUT, `${k}.html`), v);
    }

    const bundle = await repo.caseBundle(kase.id);
    const file = await encryptExport({ ...bundle, files: [{ name: 'fact-find.html', base64: Buffer.from(htmls.factfind).toString('base64') }] }, 'workflow test passphrase', now, 20_000);
    const back = decryptExportFile(file, 'workflow test passphrase');
    assert.equal(back.case.reference, kase.reference);
    assert.equal(back.files.length, 1);
  } finally {
    db.close();
    worker.stop();
    server.close();
    store.close();
  }
});

test('offline demo backend works with no server at all', async () => {
  const b = new OfflineDemoBackend(0);
  const j = await b.startTranscription();
  const s = await b.getTranscription(j.id);
  assert.equal(s.status, 'completed');
  const x = await b.extract('', 1);
  assert.ok(x.proposal.fields.length > 30);
  assert.equal((await b.getTranscription('nope')).status, 'error');
});

test('server backend reports unreachable server clearly', async () => {
  const b = new ServerBackend('127.0.0.1:1', 'x', fetch, nodeUpload);
  assert.equal(b.base, 'https://127.0.0.1:1');
  await assert.rejects(b.health(), /Cannot reach the server/);
});
