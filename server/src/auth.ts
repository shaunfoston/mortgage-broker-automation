import crypto from 'node:crypto';

// ── Password hashing (scrypt, N=2^15) ──
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const got = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length, { N, r, p, maxmem: SCRYPT.maxmem });
  return crypto.timingSafeEqual(got, expected);
}

/** A dummy hash so unknown usernames take the same time as wrong passwords. */
export const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 12) out.push('at least 12 characters');
  if (pw.length > 200) out.push('at most 200 characters');
  if (/^(.)\1+$/.test(pw)) out.push('not a single repeated character');
  return out;
}

// ── Signed tokens (JWT, HS256) ──
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface TokenClaims {
  sub: string;
  name: string;
  iat: number;
  exp: number;
}

export function signToken(claims: Omit<TokenClaims, 'iat' | 'exp'>, secret: Buffer, ttlMs: number, now = Date.now()): { token: string; expiresAt: string } {
  const iat = Math.floor(now / 1000);
  const exp = Math.floor((now + ttlMs) / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...claims, iat, exp }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return { token: `${header}.${body}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyToken(token: string, secret: Buffer, now = Date.now()): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  let header: any;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256') return null;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as TokenClaims;
    if (typeof c.exp !== 'number' || c.exp * 1000 <= now) return null;
    if (typeof c.sub !== 'string') return null;
    return c;
  } catch {
    return null;
  }
}

// ── Rate limiting / lockout ──
export class RateLimiter {
  private hits = new Map<string, number[]>();
  limit: number;
  windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  /** Record a hit; returns ms to wait if over limit, else 0. */
  hit(key: string, now = Date.now()): number {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    if (arr.length > this.limit) return this.windowMs - (now - arr[0]);
    return 0;
  }
  check(key: string, now = Date.now()): number {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    return arr.length >= this.limit ? this.windowMs - (now - arr[0]) : 0;
  }
  reset(key: string) {
    this.hits.delete(key);
  }
}
