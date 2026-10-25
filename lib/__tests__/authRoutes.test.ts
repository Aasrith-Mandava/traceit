import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db';
import type { User } from '../types';

// The /api/auth routes end to end on a throwaway SQLite file: sign-up (with first-account
// adoption of local data), sign-in, sign-out, me, DEMO_MODE guests, limits and same-origin.
const dir = mkdtempSync(join(tmpdir(), 'traceit-auth-routes-'));
process.env.TRACEIT_DB_PATH = join(dir, 'test.db');

type Routes = {
  signup: typeof import('../../app/api/auth/signup/route');
  signin: typeof import('../../app/api/auth/signin/route');
  signout: typeof import('../../app/api/auth/signout/route');
  demo: typeof import('../../app/api/auth/demo/route');
  me: typeof import('../../app/api/auth/me/route');
};
let r: Routes;
let db: Db;
let resetAuthLimits: () => void;

beforeAll(async () => {
  r = {
    signup: await import('../../app/api/auth/signup/route'),
    signin: await import('../../app/api/auth/signin/route'),
    signout: await import('../../app/api/auth/signout/route'),
    demo: await import('../../app/api/auth/demo/route'),
    me: await import('../../app/api/auth/me/route'),
  };
  db = (await import('../db')).getDb();
  ({ resetAuthLimits } = await import('../auth/limits'));
});

beforeEach(() => resetAuthLimits());

afterEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.TRACEIT_ADOPT_LOCAL_DATA;
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const HOST = 'localhost:3000';
const post = (path: string, data: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://${HOST}${path}`, {
    method: 'POST',
    body: data === undefined ? null : JSON.stringify(data),
    headers: { host: HOST, 'content-type': 'application/json', ...headers },
  });
const me = (cookie?: string) =>
  r.me.GET(new Request(`http://${HOST}/api/auth/me`, { headers: { host: HOST, ...(cookie ? { cookie } : {}) } }));
/** The `name=value` part of a Set-Cookie header (what the browser sends back). */
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

const PASSWORD = 'long enough password';
const signup = (over: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  r.signup.POST(post('/api/auth/signup', { name: 'Ada', email: `ada-${Math.random()}@example.test`, password: PASSWORD, role: 'student', ...over }, headers));

describe('POST /api/auth/signup', () => {
  it('the first account adopts the local data (not the seeded demo), in one go; later ones adopt nothing', async () => {
    const { LOCAL_STUDENT_ID } = await import('../db');
    const { localDataToAdopt } = await import('../auth/accounts');
    const local = await db.createSession({ lectureId: 'demo-chain-rule', courseId: 'calc1', title: 'my notes', studentId: LOCAL_STUDENT_ID });
    const seeded = await db.createSession({ id: 'demo-maya-1', lectureId: 'demo-chain-rule', courseId: 'calc1', title: 'Maya', studentId: LOCAL_STUDENT_ID });
    const upload = await db.createLecture({
      title: 'Old upload', courseId: 'general', mediaPath: 'data/uploads/x.mp3', mediaType: 'audio', mime: 'audio/mpeg',
      durationMs: 1000, words: [], transcriptSource: 'none',
    });
    expect(await localDataToAdopt()).toEqual({ sessions: 1, lectures: 1 });

    const res = await signup({ name: '  Ada   Lovelace ', email: 'Ada@Example.test', role: 'teacher' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: User; adopted?: unknown };
    expect(body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.test', role: 'teacher', guest: false });
    expect(body).not.toHaveProperty('user.passwordHash');
    expect(body.adopted).toEqual({ sessions: 1, lectures: 1 });
    expect((await db.getSession(local.id))!.studentId).toBe(body.user.id);
    expect((await db.getSession(seeded.id))!.studentId).toBe(LOCAL_STUDENT_ID);
    expect((await db.getLecture(upload.id))!.ownerId).toBe(body.user.id);
    expect(await localDataToAdopt()).toBeNull();

    // Signed in straight away, with a safe cookie.
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^traceit_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    expect(await (await me(cookieOf(res))).json()).toEqual({ user: body.user });

    const later = await db.createSession({ lectureId: 'demo-chain-rule', courseId: 'calc1', title: 'later', studentId: LOCAL_STUDENT_ID });
    const second = await signup();
    expect(second.status).toBe(201);
    expect(await second.json()).not.toHaveProperty('adopted');
    expect((await db.getSession(later.id))!.studentId).toBe(LOCAL_STUDENT_ID);
  });

  it('refuses a taken email (any case) with 409', async () => {
    expect((await signup({ email: 'taken@example.test' })).status).toBe(201);
    const res = await signup({ email: 'TAKEN@example.test' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists/);
  });

  it('validates the input (400)', async () => {
    for (const bad of [
      { name: '' },
      { name: 'x'.repeat(81) },
      { email: 'not-an-email' },
      { email: 'maya@demo.invalid' },
      { password: 'short' },
      { password: 'x'.repeat(201) },
      { role: 'admin' },
      { role: undefined },
    ]) {
      const res = await signup(bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await r.signup.POST(post('/api/auth/signup', ['array']))).status).toBe(400);
  });

  it('is closed in DEMO_MODE (403) and refuses cross-site requests (403)', async () => {
    process.env.DEMO_MODE = '1';
    const demo = await signup();
    expect(demo.status).toBe(403);
    expect((await demo.json()).error).toMatch(/run TraceIt yourself/);
    delete process.env.DEMO_MODE;
    const cross = await signup({}, { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
    expect(cross.headers.get('set-cookie')).toBeNull();
  });

  it('limits sign-ups per address (429 with Retry-After)', async () => {
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < 10; i++) expect((await signup({}, ip)).status).toBe(201);
    const res = await signup({}, ip);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await signup({}, { 'x-forwarded-for': '203.0.113.8' })).status).toBe(201);
  });
});

describe('POST /api/auth/signin and /signout, GET /api/auth/me', () => {
  const email = 'grace@example.test';
  beforeAll(async () => {
    resetAuthLimits();
    expect((await signup({ name: 'Grace', email })).status).toBe(201);
  });
  const signin = (body: unknown, headers?: Record<string, string>) => r.signin.POST(post('/api/auth/signin', body, headers));

  it('signs in with the right password (any email case) and sets the session cookie', async () => {
    const res = await signin({ email: ' GRACE@example.test ', password: PASSWORD });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: User };
    expect(user).toMatchObject({ email, name: 'Grace', role: 'student' });
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/);
    expect(await (await me(cookieOf(res))).json()).toEqual({ user });
  });

  it('gives one generic 401 for a wrong password, an unknown email and a guest account', async () => {
    await db.createUser({ id: 'guest-x', email: 'guest-x@demo.invalid', name: 'Guest', role: 'student', passwordHash: null });
    for (const body of [
      { email, password: 'wrong password' },
      { email: 'nobody@example.test', password: PASSWORD },
      { email: 'guest-x@demo.invalid', password: '' + PASSWORD },
    ]) {
      const res = await signin(body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Email or password is incorrect.' });
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect((await signin({ email })).status).toBe(400);
  }, 20_000);

  it('locks an email for a while after 10 failures (429 even with the right password)', async () => {
    for (let i = 0; i < 10; i++) expect((await signin({ email, password: `wrong ${i}` })).status).toBe(401);
    const res = await signin({ email, password: PASSWORD });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    resetAuthLimits();
    expect((await signin({ email, password: PASSWORD })).status).toBe(200);
  });

  it('signs out: 303 to /signin, cookie cleared, the session no longer works', async () => {
    const cookie = cookieOf(await signin({ email, password: PASSWORD }));
    expect((await me(cookie)).status).toBe(200);
    const res = await r.signout.POST(post('/api/auth/signout', undefined, { cookie }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/signin');
    expect(res.headers.get('set-cookie')).toMatch(/^traceit_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0/);
    const after = await me(cookie);
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: 'Sign in to continue.' });
    expect((await me()).status).toBe(401);
  });
});

describe('POST /api/auth/demo', () => {
  const demo = (body?: unknown) => r.demo.POST(post('/api/auth/demo', body));

  it('does not exist outside DEMO_MODE (404)', async () => {
    expect((await demo({ as: 'student' })).status).toBe(404);
  });

  it('503 until the demo accounts exist, then signs into the shared guests', async () => {
    process.env.DEMO_MODE = '1';
    expect((await demo({ as: 'student' })).status).toBe(503);

    const { ensureDemoUsers, DEMO_CLASS_ID, DEMO_TEACHER_ID, DEMO_STUDENT_ID, DEMO_JOIN_CODE } = await import('../demoAccounts');
    await ensureDemoUsers(db);
    await ensureDemoUsers(db); // idempotent

    const res = await demo({ as: 'student' });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: User };
    expect(user).toMatchObject({ id: DEMO_STUDENT_ID, name: 'Maya', role: 'student', guest: true });
    expect(res.headers.get('set-cookie')).toContain('Max-Age=86400');
    expect((await (await me(cookieOf(res))).json()).user.id).toBe(DEMO_STUDENT_ID);

    const teacher = await demo({ as: 'teacher' });
    expect(((await teacher.json()) as { user: User }).user).toMatchObject({ id: DEMO_TEACHER_ID, role: 'teacher', guest: true });
    expect(((await (await demo()).json()) as { user: User }).user.id).toBe(DEMO_STUDENT_ID);
    expect((await demo({ as: 'admin' })).status).toBe(400);

    // The demo class: taught by the demo teacher, Maya + 5 classmates, holding the bundled lecture.
    expect(await db.getClassByJoinCode(DEMO_JOIN_CODE)).toMatchObject({ id: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID });
    expect(await db.listClassStudentIds(DEMO_CLASS_ID)).toHaveLength(6);
    expect((await db.getLecture('demo-chain-rule'))!.classId).toBe(DEMO_CLASS_ID);
    // Guests can't sign in with a password.
    expect((await r.signin.POST(post('/api/auth/signin', { email: 'maya@demo.invalid', password: 'anything at all' }))).status).toBe(401);
  }, 20_000);
});

describe('adoptionEnabled', () => {
  it('is on by default, off in DEMO_MODE or with TRACEIT_ADOPT_LOCAL_DATA=0', async () => {
    const { adoptionEnabled } = await import('../auth/accounts');
    expect(adoptionEnabled({})).toBe(true);
    expect(adoptionEnabled({ TRACEIT_ADOPT_LOCAL_DATA: '1' })).toBe(true);
    expect(adoptionEnabled({ TRACEIT_ADOPT_LOCAL_DATA: '0' })).toBe(false);
    expect(adoptionEnabled({ DEMO_MODE: '1' })).toBe(false);
  });
});
