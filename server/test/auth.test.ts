import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RateLimiter, hashPassword, passwordProblems, signToken, verifyPassword, verifyToken } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';

const secret = crypto.randomBytes(32);

test('password hashing', () => {
  const h = hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$32768\$8\$1\$/);
  assert.ok(verifyPassword('correct horse battery', h));
  assert.ok(!verifyPassword('correct horse batterY', h));
  assert.ok(!verifyPassword('x', 'garbage'));
  assert.deepEqual(passwordProblems('short'), ['at least 12 characters']);
});

test('tokens: valid, expired, tampered, wrong secret, alg none', () => {
  const { token } = signToken({ sub: 'u1', name: 'Broker' }, secret, 60_000);
  assert.equal(verifyToken(token, secret)!.sub, 'u1');
  assert.equal(verifyToken(token, secret, Date.now() + 61_000), null, 'expired');
  assert.equal(verifyToken(token, crypto.randomBytes(32)), null, 'wrong secret');
  const [h, b, s] = token.split('.');
  const evil = Buffer.from(JSON.stringify({ sub: 'admin', name: 'x', iat: 0, exp: 9e9 })).toString('base64url');
  assert.equal(verifyToken(`${h}.${evil}.${s}`, secret), null, 'tampered body');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal(verifyToken(`${none}.${b}.`, secret), null, 'alg none rejected');
  assert.equal(verifyToken('nope', secret), null);
});

test('rate limiter', () => {
  const r = new RateLimiter(3, 1000);
  assert.equal(r.hit('a', 0), 0);
  assert.equal(r.hit('a', 1), 0);
  assert.equal(r.hit('a', 2), 0);
  assert.ok(r.hit('a', 3) > 0);
  assert.equal(r.hit('a', 2000), 0, 'window slides');
  assert.equal(r.hit('b', 3), 0, 'keys independent');
});

test('config: live mode demands keys and secrets; demo does not', () => {
  assert.throws(() => loadConfig({ AI_MODE: 'live' }, []), /ASSEMBLYAI_API_KEY[\s\S]*ANTHROPIC_API_KEY|JWT_SECRET/);
  assert.throws(() => loadConfig({ AI_MODE: 'demo', JWT_SECRET: 'tooshort' }, []), /at least 32/);
  const demo = loadConfig({}, []);
  assert.equal(demo.mode, 'demo');
  assert.ok(demo.warnings.length >= 2);
  const live = loadConfig(
    { AI_MODE: 'live', JWT_SECRET: 'x'.repeat(40), DATA_KEY: 'y'.repeat(40), ASSEMBLYAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' },
    [],
  );
  assert.equal(live.assemblyAi.baseUrl, 'https://api.eu.assemblyai.com');
  assert.equal(live.anthropic.model, 'claude-sonnet-5-5');
});
