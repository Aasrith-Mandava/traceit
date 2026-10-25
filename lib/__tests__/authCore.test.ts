import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../db';
import type { User } from '../types';
import { signedInCookie } from './authHelpers';

// Sessions, cookies, withUser and the open-redirect guard, on a throwaway SQLite file.
const dir = mkdtempSync(join(tmpdir(), 'traceit-auth-core-'));
process.env.TRACEIT_DB_PATH = join(dir, 'test.db');

let core: typeof import('../auth/core');
let db: Db;

beforeAll(async () => {
  core = await import('../auth/core');
  db = (await import('../db')).getDb();
});

afterEach(() => {
  delete process.env.TRACEIT_COOKIE_SECURE;
});

afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
});

const req = (url = 'http://localhost:3000/api/x', headers: Record<string, string> = {}) => new Request(url, { headers });

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(core.safeNext('/review/s_1?tab=2#m')).toBe('/review/s_1?tab=2#m');
    expect(core.safeNext('/teacher/l_1')).toBe('/teacher/l_1');
    expect(core.safeNext('/')).toBe('/');
  });

  it('falls back to /app for anything that could leave the site', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'app',
      'https://evil.example/',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/%0a/evil',
      'javascript:alert(1)',
      `/${'a'.repeat(3000)}`,
    ]) {
      const out = core.safeNext(bad);
      expect(out.startsWith('/') && !out.startsWith('//'), String(bad)).toBe(true);
      if (bad !== '/%0a/evil') expect(out, String(bad)).toBe('/app');
    }
  });
});

describe('cookies', () => {
  it('marks the cookie Secure over HTTPS (proxy header or URL) and honours TRACEIT_COOKIE_SECURE', () => {
    expect(core.cookieIsSecure(req())).toBe(false);
    expect(core.cookieIsSecure(req('https://traceit.example/'))).toBe(true);
    expect(core.cookieIsSecure(req('http://internal:8080/', { 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(core.cookieIsSecure(req('https://traceit.example/', { 'x-forwarded-proto': 'http' }))).toBe(false);
    process.env.TRACEIT_COOKIE_SECURE = '1';
    expect(core.cookieIsSecure(req())).toBe(true);
    process.env.TRACEIT_COOKIE_SECURE = '0';
    expect(core.cookieIsSecure(req('https://traceit.example/'))).toBe(false);
  });

  it('starts a session: HttpOnly, SameSite=Lax cookie; only the token hash is stored', async () => {
    const user = (await db.createUser({ email: 'core@example.test', name: 'Core', role: 'student', passwordHash: 'x' }))!;
    const { token, setCookie } = await core.startSession(user.id, { request: req('https://traceit.example/') });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookie).toBe(`traceit_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}; Secure`);
    expect(await db.getAuthSessionUser(token, new Date().toISOString())).toBeNull();
    expect(await db.getAuthSessionUser(core.hashToken(token), new Date().toISOString())).toEqual(user);
    const cookie = `other=1; traceit_session=${token}; x=y`;
    expect(await core.userFromRequest(req(undefined, { cookie }))).toEqual(user);

    const guest = await core.startSession(user.id, { request: req(), ttlDays: 1 });
    expect(guest.setCookie).toContain(`Max-Age=86400`);
    expect(guest.setCookie).not.toContain('Secure');
  });

  it('ignores missing, malformed, unknown and expired tokens', async () => {
    expect(await core.userFromRequest(req())).toBeNull();
    expect(await core.userFromRequest(req(undefined, { cookie: 'traceit_session=short' }))).toBeNull();
    expect(await core.userFromRequest(req(undefined, { cookie: `traceit_session=${'a'.repeat(43)}` }))).toBeNull();
    const user = (await db.createUser({ email: 'expired@example.test', name: 'E', role: 'student', passwordHash: 'x' }))!;
    const token = 'b'.repeat(43);
    await db.createAuthSession({ tokenHash: core.hashToken(token), userId: user.id, expiresAtIso: new Date(Date.now() - 1000).toISOString() });
    expect(await core.userFromRequest(req(undefined, { cookie: `traceit_session=${token}` }))).toBeNull();
  });

  it('revokes the session on sign-out and clears the cookie', async () => {
    const { user, cookie } = await signedInCookie(db);
    expect(await core.userFromRequest(req(undefined, { cookie }))).toEqual(user);
    await core.revokeSession(req(undefined, { cookie }));
    expect(await core.userFromRequest(req(undefined, { cookie }))).toBeNull();
    expect(core.endSessionCookie(req())).toBe('traceit_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  });
});

describe('withUser', () => {
  it('401s without a session and passes the user and route context through otherwise', async () => {
    const handler = core.withUser(async (_req: Request, user: User, c: { params: Promise<{ id: string }> }) =>
      Response.json({ userId: user.id, id: (await c.params).id }),
    );
    const ctx = { params: Promise.resolve({ id: 'abc' }) };
    const res = await handler(req(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in to continue.' });
    const { user, cookie } = await signedInCookie(db, { role: 'teacher' });
    const ok = await handler(req(undefined, { cookie }), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ userId: user.id, id: 'abc' });
  });
});
