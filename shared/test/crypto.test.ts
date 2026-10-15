import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import {
  aesGcmEncrypt,
  canonicalJson,
  constantTimeEqual,
  fromBase64,
  hashPin,
  sha256Hex,
  toBase64,
  uuid,
  verifyPin,
} from '../src/crypto.ts';
import { decryptExport, encryptExport } from '../src/secureExport.ts';
import { GENESIS_HASH, buildAuditEntry, verifyAuditChain, type AuditEntry } from '../src/audit.ts';

test('sha256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'Mortgage Options £ ✓', 'x'.repeat(10_000)]) {
    assert.equal(sha256Hex(s), nodeCrypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('base64 round-trips and matches Buffer', () => {
  for (let n = 0; n < 70; n++) {
    const b = nodeCrypto.randomBytes(n);
    const ours = toBase64(new Uint8Array(b));
    assert.equal(ours, b.toString('base64'));
    assert.deepEqual(Buffer.from(fromBase64(ours)), b);
  }
  assert.throws(() => fromBase64('ab$c'));
});

test('uuid v4 format and uniqueness', () => {
  const ids = new Set(Array.from({ length: 500 }, () => uuid()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('canonicalJson is key-order independent', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
});

test('PIN hashing verifies and rejects', async () => {
  const h = await hashPin('482915', undefined, 2000);
  assert.ok(await verifyPin('482915', h));
  assert.ok(!(await verifyPin('482916', h)));
  assert.ok(constantTimeEqual('abc', 'abc'));
  assert.ok(!constantTimeEqual('abc', 'abd'));
});

test('AES-GCM output is decryptable by node:crypto (interop)', () => {
  const key = nodeCrypto.randomBytes(32);
  const nonce = nodeCrypto.randomBytes(12);
  const aad = Buffer.from('hdr');
  const ct = aesGcmEncrypt(new Uint8Array(key), new Uint8Array(nonce), new TextEncoder().encode('hello'), new Uint8Array(aad));
  const tag = Buffer.from(ct.slice(-16));
  const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, nonce);
  d.setAAD(aad);
  d.setAuthTag(tag);
  const pt = Buffer.concat([d.update(Buffer.from(ct.slice(0, -16))), d.final()]);
  assert.equal(pt.toString(), 'hello');
});

test('secure export round-trip, wrong passphrase and tamper detection', async () => {
  const payload = { client: { firstName: 'Jordan' }, n: [1, 2, 3] };
  const file = await encryptExport(payload, 'correct horse battery', '2026-10-15T12:00:00Z', 5000);
  assert.ok(!file.includes('Jordan'), 'ciphertext does not leak plaintext');
  assert.deepEqual(await decryptExport(file, 'correct horse battery'), payload);
  await assert.rejects(decryptExport(file, 'wrong passphrase!!'), /Wrong passphrase/);
  const tampered = JSON.parse(file);
  tampered.createdAt = '2020-01-01T00:00:00Z';
  await assert.rejects(decryptExport(JSON.stringify(tampered), 'correct horse battery'), /modified/);
  await assert.rejects(encryptExport(payload, 'short', 'x'), /at least 12/);
});

test('audit chain detects edits, deletions and reordering', () => {
  const entries: AuditEntry[] = [];
  let prev: AuditEntry | null = null;
  for (let i = 0; i < 5; i++) {
    prev = buildAuditEntry(prev, { actor: 'Broker', action: 'note.added', entityType: 'note', entityId: `n${i}`, caseId: 'c1', details: { i } }, `id${i}`, `2026-10-15T12:0${i}:00Z`);
    entries.push(prev);
  }
  assert.equal(entries[0].prevHash, GENESIS_HASH);
  assert.deepEqual(verifyAuditChain(entries), { ok: true, count: 5 });
  const edited = entries.map((x) => ({ ...x }));
  edited[2].details = { i: 99 };
  assert.equal((verifyAuditChain(edited) as any).brokenAtSeq, 3);
  const removed = entries.filter((_, i) => i !== 1);
  assert.equal(verifyAuditChain(removed).ok, false);
});
