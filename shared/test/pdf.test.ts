import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentHtml, escapeHtml, factFindHtml, meetingSummaryHtml } from '../src/pdf/templates.ts';
import { emptyFactFind, setValue } from '../src/factfind/model.ts';
import type { CaseRecord, Client, ConsentRecord, Recording } from '../src/db/repo.ts';
import { DEMO_UTTERANCES } from '../src/demo.ts';

const client: Client = { id: 'c', firstName: 'Jordan', lastName: '<script>alert(1)</script>', email: null, phone: null, isDemo: true, createdAt: '', updatedAt: '' };

function mkCase(): CaseRecord {
  let ff = emptyFactFind(1);
  ff = setValue(ff, 'a1.personal.firstName', 'Jordan');
  ff = setValue(ff, 'a1.employment.basicSalary', 42500);
  ff = setValue(ff, 'case.objectives.objectives', '<img src=x onerror=alert(1)>');
  return {
    id: 'k', clientId: 'c', reference: 'MO-2026-0001', purpose: 'First-time purchase', status: 'Fact-find', numApplicants: 1, factFind: ff,
    provenance: { 'a1.employment.basicSalary': { source: 'ai', at: '', by: 'b' } }, createdAt: '2026-10-15T10:00:00Z', updatedAt: '2026-10-15T11:00:00Z',
  };
}

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('fact-find PDF HTML is branded, escaped and marks AI values', () => {
  const html = factFindHtml({ client, caseRec: mkCase(), generatedAt: '2026-10-15T12:00:00Z', generatedBy: 'Test Broker' });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /Mortgage Fact-Find/);
  assert.match(html, /MO-2026-0001/);
  assert.match(html, /£42,500<span class="ai">AI<\/span>/);
  assert.match(html, /#1F4FD8/);
  assert.match(html, /Not a lender affordability assessment/);
});

test('meeting summary includes transcript and demo banner', () => {
  const rec: Recording = {
    id: 'r', caseId: 'k', fileUri: null, mime: null, durationMs: 120000, sizeBytes: null, consentConfirmedAt: '2026-10-15T10:00:00Z', consentConfirmedBy: 'b',
    disclosureVersion: 'v', status: 'transcribed', remoteJobId: null, transcript: 'x', utterances: DEMO_UTTERANCES, provider: 'demo', error: null, createdAt: '2026-10-15T10:00:00Z', updatedAt: '',
  };
  const html = meetingSummaryHtml({ client, caseRec: mkCase(), recording: rec, extraction: null, generatedAt: '2026-10-15T12:00:00Z', generatedBy: 'B' });
  assert.match(html, /DEMO MODE/);
  assert.match(html, /Speaker A:/);
  assert.match(html, /fourteenth of March 1991/);
});

test('consent record shows signature, timestamps, hashes and draft warning', () => {
  const consent: ConsentRecord = {
    id: 'x', caseId: 'k', applicantIndex: 1, signerName: 'Jordan Testwell', consentVersion: 'v1', consentTextHash: 'a'.repeat(64),
    answers: { privacyNotice: true, processing: true, marketing: false }, signatureSha256: 'b'.repeat(64), signedAtUtc: '2026-10-15T12:30:00.000Z',
    signedAtLocal: '2026-10-15T13:30:00+01:00', timeZone: 'Europe/London', brokerName: 'Test Broker', device: 'Pixel', signature: 'data:image/png;base64,AAAA',
    recordHash: 'c'.repeat(64), withdrawnAt: null, createdAt: '',
  };
  const html = consentHtml({ client, caseRec: mkCase(), consent, verified: true, generatedAt: '2026-10-15T12:00:00Z', generatedBy: 'B' });
  assert.match(html, /Draft consent wording/);
  assert.match(html, /Integrity check passed/);
  assert.match(html, /2026-10-15T12:30:00.000Z/);
  assert.match(html, /data:image\/png;base64,AAAA/);
  assert.match(html, /✗ Not agreed/);
  const bad = consentHtml({ client, caseRec: mkCase(), consent, verified: false, generatedAt: '', generatedBy: 'B' });
  assert.match(bad, /FAILED/);
});
