import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openNodeDb } from './nodeAdapter.ts';
import { migrate, SCHEMA_VERSION } from '../src/db/migrations.ts';
import { Repo, ValidationError } from '../src/db/repo.ts';
import { normaliseExtraction } from '../src/extraction.ts';
import { DEMO_CLIENTS, DEMO_EXTRACTION_RAW, DEMO_TRANSCRIPT, DEMO_UTTERANCES } from '../src/demo.ts';
import { getList, getValue, overallProgress } from '../src/factfind/model.ts';

// 1x1 transparent PNG, repeated to look like a real signature payload.
const SIG = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(3);

async function setup(file = ':memory:') {
  const db = openNodeDb(file);
  await migrate(db);
  const repo = new Repo(db, { actor: () => 'Test Broker' });
  return { db, repo };
}

test('migrations are idempotent', async () => {
  const { db } = await setup();
  assert.equal(await migrate(db), SCHEMA_VERSION);
  db.close();
});

test('end-to-end case lifecycle with fictional client, persisted across reopen', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mo-')), 'test.db');
  let { db, repo } = await setup(file);
  const d = DEMO_CLIENTS[0];

  await assert.rejects(repo.createClient({ firstName: '', lastName: 'X', email: 'bad' }), (e: any) => {
    assert.ok(e instanceof ValidationError);
    assert.equal(e.fields.firstName, 'Required');
    assert.ok(e.fields.email);
    return true;
  });

  const client = await repo.createClient({ ...d, isDemo: true });
  const kase = await repo.createCase(client.id, { purpose: d.purpose, numApplicants: 1 });
  assert.match(kase.reference, /^MO-\d{4}-0001$/);
  assert.equal(getValue(kase.factFind, 'a1.personal.firstName'), 'Jordan');
  assert.equal(getValue(kase.factFind, 'case.mortgage.purpose'), 'First-time purchase');

  // Manual fact-find entry, with validation failure leaving data unchanged.
  await assert.rejects(repo.saveSection(kase.id, 'a1', 'employment', { basicSalary: 'lots', status: 'Employed' }), ValidationError);
  assert.equal(getValue((await repo.getCase(kase.id))!.factFind, 'a1.employment.status'), null);
  await repo.saveSection(kase.id, 'a1', 'personal', { dateOfBirth: '14/03/1991', title: 'mx' });
  await repo.saveList(kase.id, 'a1', 'addressHistory', [], true);
  await assert.rejects(repo.saveSection(kase.id, 'a2', 'personal', { firstName: 'X' }), /one applicant/);

  // Recording requires consent confirmation; transcript moves status on.
  await assert.rejects(repo.createRecording({ caseId: kase.id, fileUri: 'file:///a.m4a', mime: 'audio/mp4', durationMs: 1, sizeBytes: 1, consentConfirmedAt: '' }));
  const rec = await repo.createRecording({
    caseId: kase.id, fileUri: 'file:///meeting.m4a', mime: 'audio/mp4', durationMs: 180000, sizeBytes: 1_440_000, consentConfirmedAt: new Date().toISOString(),
  });
  await repo.markTranscriptionStarted(rec.id, 'job-1', 'demo');
  await repo.setTranscript(rec.id, DEMO_TRANSCRIPT, DEMO_UTTERANCES);
  assert.equal((await repo.getCase(kase.id))!.status, 'Meeting held');

  // AI extraction: nothing applied until reviewed.
  const proposal = normaliseExtraction(DEMO_EXTRACTION_RAW, 1);
  const ex = await repo.createExtraction(kase.id, rec.id, proposal, 'demo');
  assert.equal(ex.items.length, proposal.fields.length + proposal.listItems.length);
  let c = (await repo.getCase(kase.id))!;
  assert.equal(c.status, 'AI review');
  assert.equal(getValue(c.factFind, 'a1.employment.basicSalary'), null, 'not applied before review');

  const salary = ex.items.find((i) => i.path === 'a1.employment.basicSalary')!;
  const bonus = ex.items.find((i) => i.path === 'a1.employment.bonus')!;
  const deposit = ex.items.find((i) => i.path === 'case.deposit.amount')!;
  await repo.decideItem(salary.id, 'accepted');
  await assert.rejects(repo.decideItem(salary.id, 'rejected'), /already decided/);
  await assert.rejects(repo.decideItem(bonus.id, 'edited', 'lots'), ValidationError);
  await repo.decideItem(bonus.id, 'edited', '2,800');
  await repo.decideItem(deposit.id, 'rejected');
  const bulk = await repo.acceptAllAbove(ex.id, 0.85);
  assert.ok(bulk.accepted > 20);
  assert.equal(bulk.failed, 0);

  c = (await repo.getCase(kase.id))!;
  assert.equal(getValue(c.factFind, 'a1.employment.basicSalary'), 42500);
  assert.equal(getValue(c.factFind, 'a1.employment.bonus'), 2800);
  assert.equal(getValue(c.factFind, 'case.deposit.amount'), null, 'rejected value not applied');
  assert.equal(c.provenance['a1.employment.basicSalary'].source, 'ai');
  assert.equal(getList(c.factFind, 'a1.liabilities').length, 2);
  assert.ok(overallProgress(c.factFind).percent > 30);

  const pendingLeft = (await repo.getExtraction(ex.id))!.items.filter((i) => i.decision === 'pending');
  for (const it of pendingLeft) await repo.decideItem(it.id, 'rejected');
  assert.equal((await repo.getExtraction(ex.id))!.status, 'reviewed');

  // Consent + signature.
  await assert.rejects(
    repo.saveConsent({ caseId: kase.id, applicantIndex: 1, signerName: 'Jordan Testwell', answers: { processing: true }, signatureDataUrl: SIG, signedAt: new Date(), timeZone: 'Europe/London', device: 'test' }),
    (e: any) => !!e.fields.answers,
  );
  await assert.rejects(
    repo.saveConsent({ caseId: kase.id, applicantIndex: 1, signerName: 'Jordan Testwell', answers: { privacyNotice: true, processing: true }, signatureDataUrl: 'data:image/png;base64,AA', signedAt: new Date(), timeZone: 'Europe/London', device: 'test' }),
    (e: any) => !!e.fields.signature,
  );
  const consent = await repo.saveConsent({
    caseId: kase.id, applicantIndex: 1, signerName: 'Jordan Testwell',
    answers: { privacyNotice: true, processing: true, recording: true, marketing: false },
    signatureDataUrl: SIG, signedAt: new Date('2026-10-15T12:30:00Z'), timeZone: 'Europe/London', device: 'node-test',
  });
  assert.equal(consent.signedAtUtc, '2026-10-15T12:30:00.000Z');
  assert.equal((await repo.getCase(kase.id))!.status, 'Consent signed');
  const stored = (await repo.listConsents(kase.id))[0];
  assert.ok(repo.verifyConsent(stored));
  assert.ok(!repo.verifyConsent({ ...stored, signerName: 'Someone Else' }), 'tampered consent fails verification');

  await repo.addNote(kase.id, 'Client prefers email contact.');
  await repo.addDocument({ caseId: kase.id, category: 'Payslips', name: 'payslip-sep.pdf', mime: 'application/pdf', sizeBytes: 1234, fileUri: 'file:///docs/p.pdf', sha256: 'ab'.repeat(32) });

  // Audit trail is complete, verifiable and append-only.
  const audit = await repo.listAudit(kase.id);
  assert.ok(audit.length > 40);
  assert.ok(audit.every((a) => !JSON.stringify(a.details).includes('Jordan')), 'no personal data in audit details');
  assert.deepEqual((await repo.verifyAudit()).ok, true);
  await assert.rejects(db.run("UPDATE audit_log SET actor='x' WHERE seq=1"), /append-only/);
  await assert.rejects(db.run('DELETE FROM audit_log WHERE seq=1'), /append-only/);

  // Close and reopen: everything persists.
  db.close();
  ({ db, repo } = await setup(file));
  const reopened = (await repo.getCase(kase.id))!;
  assert.equal(getValue(reopened.factFind, 'a1.employment.basicSalary'), 42500);
  assert.equal((await repo.listRecordings(kase.id))[0].utterances.length, DEMO_UTTERANCES.length);
  assert.equal((await repo.listNotes(kase.id)).length, 1);
  assert.equal((await repo.listClients('testwell')).length, 1);
  assert.equal((await repo.listClients('MO-')).length, 1, 'search by case reference');

  const bundle = await repo.caseBundle(kase.id);
  assert.equal(bundle.client!.lastName, 'Testwell');
  assert.ok(bundle.audit.length > 40);
  assert.equal((bundle.recordings[0] as any).fileUri, undefined);

  // Right to erasure removes all personal data; audit chain still verifies.
  await assert.rejects(repo.eraseClient(client.id, 'because' as any), /reason/);
  const erased = await repo.eraseClient(client.id, 'Client request');
  assert.deepEqual(erased.fileUris.sort(), ['file:///docs/p.pdf', 'file:///meeting.m4a']);
  assert.equal(await repo.getCase(kase.id), null);
  for (const t of ['clients', 'cases', 'recordings', 'extractions', 'extraction_items', 'consents', 'documents', 'notes']) {
    assert.equal(Number((await db.get<any>(`SELECT COUNT(*) AS n FROM ${t}`))!.n), 0, `${t} emptied`);
  }
  assert.equal((await repo.verifyAudit()).ok, true);
  db.close();
});

test('joint case: applicant 2 data and consents for both applicants', async () => {
  const { db, repo } = await setup();
  const d = DEMO_CLIENTS[1];
  const client = await repo.createClient(d);
  let kase = await repo.createCase(client.id, { purpose: d.purpose, numApplicants: 1 });
  kase = await repo.setNumApplicants(kase.id, 2);
  await repo.saveSection(kase.id, 'a2', 'personal', { firstName: 'Sam', lastName: 'Sampleton', dateOfBirth: '01/02/1988' });
  const sign = (i: 1 | 2) =>
    repo.saveConsent({ caseId: kase.id, applicantIndex: i, signerName: `Applicant ${i}`, answers: { privacyNotice: true, processing: true }, signatureDataUrl: SIG, signedAt: new Date(), timeZone: 'Europe/London', device: 't' });
  await sign(1);
  assert.equal((await repo.getCase(kase.id))!.status, 'Fact-find', 'needs both signatures');
  await sign(2);
  assert.equal((await repo.getCase(kase.id))!.status, 'Consent signed');
  assert.equal(getValue((await repo.getCase(kase.id))!.factFind, 'a2.personal.firstName'), 'Sam');
  // Changing client name via fact-find keeps client list in sync.
  await repo.saveSection(kase.id, 'a1', 'personal', { lastName: 'Sampleton-Jones' });
  assert.equal((await repo.getClient(client.id))!.lastName, 'Sampleton-Jones');
  db.close();
});

test('concurrent transactions are serialised and audit seq stays gapless', async () => {
  const { db, repo } = await setup();
  const client = await repo.createClient({ firstName: 'Casey', lastName: 'Fictional' });
  const kase = await repo.createCase(client.id);
  await Promise.all(Array.from({ length: 25 }, (_, i) => repo.addNote(kase.id, `note ${i}`)));
  assert.equal((await repo.listNotes(kase.id)).length, 25);
  assert.equal((await repo.verifyAudit()).ok, true);
  db.close();
});

test('bulk accept never overwrites a different existing value', async () => {
  const { db, repo } = await setup();
  const client = await repo.createClient({ firstName: 'Jordan', lastName: 'Testwell' });
  const kase = await repo.createCase(client.id);
  await repo.saveSection(kase.id, 'a1', 'employment', { basicSalary: '40000' });
  const ex = await repo.createExtraction(kase.id, null, normaliseExtraction(DEMO_EXTRACTION_RAW, 1), 'demo');
  const r = await repo.acceptAllAbove(ex.id);
  assert.ok(r.skippedConflicts >= 1);
  let c = (await repo.getCase(kase.id))!;
  assert.equal(getValue(c.factFind, 'a1.employment.basicSalary'), 40000, 'manual value preserved');
  assert.equal(getValue(c.factFind, 'a1.personal.firstName'), 'Jordan');
  assert.equal(c.provenance['a1.personal.firstName'].source, 'manual', 'same value keeps manual provenance');
  const item = (await repo.getExtraction(ex.id))!.items.find((i) => i.path === 'a1.employment.basicSalary')!;
  assert.equal(item.decision, 'pending');
  await repo.decideItem(item.id, 'accepted');
  c = (await repo.getCase(kase.id))!;
  assert.equal(getValue(c.factFind, 'a1.employment.basicSalary'), 42500, 'explicit accept overwrites');
  assert.equal(c.provenance['a1.employment.basicSalary'].source, 'ai');
  db.close();
});
