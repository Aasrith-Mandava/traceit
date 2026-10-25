import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildSteadyScenario } from '../../e2e/fixtures/phase2-scenario';
import type { Db } from '../db';
import type { ClassReport } from '../teacher';
import type { ClassInfo, TeacherClass, User } from '../types';
import { signedInCookie } from './authHelpers';

// The class routes end to end on a throwaway SQLite file: creating classes (teachers only, not in
// DEMO_MODE), joining with a code (students only), renaming yourself, and the teacher-only class
// heatmap that counts only the students enrolled in the lecture's class.
const dir = mkdtempSync(join(tmpdir(), 'traceit-class-routes-'));
process.env.TRACEIT_DB_PATH = join(dir, 'test.db');

type Routes = {
  classes: typeof import('../../app/api/classes/route');
  join: typeof import('../../app/api/classes/join/route');
  account: typeof import('../../app/api/account/route');
  heatmap: typeof import('../../app/api/lectures/[id]/class/route');
};
let r: Routes;
let db: Db;
let resetAuthLimits: () => void;
let loadClassReport: typeof import('../teacher').loadClassReport;

beforeAll(async () => {
  r = {
    classes: await import('../../app/api/classes/route'),
    join: await import('../../app/api/classes/join/route'),
    account: await import('../../app/api/account/route'),
    heatmap: await import('../../app/api/lectures/[id]/class/route'),
  };
  db = (await import('../db')).getDb();
  ({ resetAuthLimits } = await import('../auth/limits'));
  ({ loadClassReport } = await import('../teacher'));
});

beforeEach(() => resetAuthLimits());
afterEach(() => {
  delete process.env.DEMO_MODE;
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const HOST = 'localhost:3000';
const req = (path: string, method: string, data?: unknown, cookie?: string) =>
  new Request(`http://${HOST}${path}`, {
    method,
    body: data === undefined ? null : JSON.stringify(data),
    headers: { host: HOST, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });

async function createClass(cookie: string, name = 'Calculus I'): Promise<ClassInfo> {
  const res = await r.classes.POST(req('/api/classes', 'POST', { name }, cookie));
  expect(res.status).toBe(201);
  return ((await res.json()) as { class: ClassInfo }).class;
}

const joinWith = (code: unknown, cookie?: string) => r.join.POST(req('/api/classes/join', 'POST', { code }, cookie));

describe('POST/GET /api/classes', () => {
  it('a teacher creates a class with a fresh 8-character code and lists it with counts', async () => {
    const t = await signedInCookie(db, { role: 'teacher' });
    const cls = await createClass(t.cookie, '  Physics   101 ');
    expect(cls).toMatchObject({ name: 'Physics 101', teacherId: t.user.id, teacherName: t.user.name });
    expect(cls.joinCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

    const res = await r.classes.GET(req('/api/classes', 'GET', undefined, t.cookie));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string; classes: TeacherClass[] };
    expect(body.role).toBe('teacher');
    expect(body.classes).toEqual([expect.objectContaining({ id: cls.id, studentCount: 0, lectureCount: 0 })]);
  });

  it('refuses students (403), signed-out visitors (401), bad names (400) and DEMO_MODE (403)', async () => {
    const s = await signedInCookie(db);
    expect((await r.classes.POST(req('/api/classes', 'POST', { name: 'Mine' }, s.cookie))).status).toBe(403);
    expect((await r.classes.POST(req('/api/classes', 'POST', { name: 'Mine' }))).status).toBe(401);
    expect((await r.classes.GET(req('/api/classes', 'GET'))).status).toBe(401);
    const t = await signedInCookie(db, { role: 'teacher' });
    expect((await r.classes.POST(req('/api/classes', 'POST', { name: '   ' }, t.cookie))).status).toBe(400);
    expect((await r.classes.POST(req('/api/classes', 'POST', [], t.cookie))).status).toBe(400);
    process.env.DEMO_MODE = '1';
    expect((await r.classes.POST(req('/api/classes', 'POST', { name: 'Demo' }, t.cookie))).status).toBe(403);
  });

  it('rejects cross-site requests', async () => {
    const t = await signedInCookie(db, { role: 'teacher' });
    const res = await r.classes.POST(
      new Request(`http://${HOST}/api/classes`, {
        method: 'POST',
        body: JSON.stringify({ name: 'x' }),
        headers: { host: HOST, origin: 'https://evil.example', cookie: t.cookie },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/classes/join', () => {
  it('a student joins with the code as typed (case, dashes, spaces); joining again is a no-op', async () => {
    const t = await signedInCookie(db, { role: 'teacher', name: 'Ms. Okafor' });
    const cls = await createClass(t.cookie, 'Biology');
    const s = await signedInCookie(db);
    const typed = `${cls.joinCode.slice(0, 4).toLowerCase()}- ${cls.joinCode.slice(4)}`;
    const res = await joinWith(typed, s.cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ class: { id: cls.id, name: 'Biology', teacherName: 'Ms. Okafor' }, joined: true });
    const again = await joinWith(cls.joinCode, s.cookie);
    expect(((await again.json()) as { joined: boolean }).joined).toBe(false);

    const list = await r.classes.GET(req('/api/classes', 'GET', undefined, s.cookie));
    expect(await list.json()).toEqual({ role: 'student', classes: [{ id: cls.id, name: 'Biology', teacherName: 'Ms. Okafor' }] });
    expect(await db.listClassStudentIds(cls.id)).toEqual([s.user.id]);
  });

  it('404 for an unknown or malformed code, 400 without one, 403 for teachers, 401 signed out', async () => {
    const s = await signedInCookie(db);
    expect((await joinWith('ZZZZ9999', s.cookie)).status).toBe(404);
    expect((await joinWith('not a code', s.cookie)).status).toBe(404);
    expect((await joinWith('', s.cookie)).status).toBe(400);
    expect((await joinWith(12345678, s.cookie)).status).toBe(400);
    const t = await signedInCookie(db, { role: 'teacher' });
    const cls = await createClass(t.cookie);
    expect((await joinWith(cls.joinCode, t.cookie)).status).toBe(403);
    expect((await joinWith(cls.joinCode)).status).toBe(401);
  });

  it('rate-limits guessing per student (429 with Retry-After)', async () => {
    const s = await signedInCookie(db);
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) last = await joinWith('ZZZZ9999', s.cookie);
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('PATCH /api/account', () => {
  it('renames the signed-in user; guests 403; bad names 400; signed out 401', async () => {
    const s = await signedInCookie(db, { name: 'Old Name' });
    const res = await r.account.PATCH(req('/api/account', 'PATCH', { name: '  New   Name ' }, s.cookie));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: User }).user).toMatchObject({ id: s.user.id, name: 'New Name' });
    expect((await db.getUser(s.user.id))?.name).toBe('New Name');

    expect((await r.account.PATCH(req('/api/account', 'PATCH', { name: '' }, s.cookie))).status).toBe(400);
    expect((await r.account.PATCH(req('/api/account', 'PATCH', { name: 'x' }))).status).toBe(401);
    const guest = await signedInCookie(db, { guest: true });
    expect((await r.account.PATCH(req('/api/account', 'PATCH', { name: 'Hacker' }, guest.cookie))).status).toBe(403);
  });
});

describe('class insights count only enrolled students', () => {
  async function inkedSession(lectureId: string, studentId: string) {
    const session = await db.createSession({ lectureId, courseId: 'general', title: 'notes', studentId });
    const { strokes } = buildSteadyScenario(session.id);
    await db.upsertStrokes(session.id, strokes);
    return session;
  }

  it('the teacher of the class sees only enrolled students; others get 403/404', async () => {
    const t = await signedInCookie(db, { role: 'teacher' });
    const cls = await createClass(t.cookie, 'Chemistry');
    const lecture = await db.createLecture({
      title: 'Moles', courseId: 'general', mediaPath: 'data/uploads/m.mp3', mediaType: 'audio', mime: 'audio/mpeg',
      durationMs: 120_000, words: [], transcriptSource: 'none', ownerId: t.user.id, classId: cls.id,
    });
    const heatmap = (cookie?: string) =>
      r.heatmap.GET(req(`/api/lectures/${lecture.id}/class`, 'GET', undefined, cookie), { params: Promise.resolve({ id: lecture.id }) });

    // Two enrolled students, plus ink from outsiders and from the teacher: too few to show.
    const enrolled = [await signedInCookie(db), await signedInCookie(db)];
    for (const s of enrolled) {
      expect((await joinWith(cls.joinCode, s.cookie)).status).toBe(200);
      await inkedSession(lecture.id, s.user.id);
    }
    for (let i = 0; i < 3; i++) await inkedSession(lecture.id, (await signedInCookie(db)).user.id);
    await inkedSession(lecture.id, t.user.id);

    let res = await heatmap(t.cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as ClassReport).view.status).toBe('too-few');

    // A third enrolled student makes the class big enough; the outsiders still don't count.
    const third = await signedInCookie(db);
    await joinWith(cls.joinCode, third.cookie);
    await inkedSession(lecture.id, third.user.id);
    res = await heatmap(t.cookie);
    const report = (await res.json()) as ClassReport;
    expect(report.view).toMatchObject({ status: 'ready', classSize: 3 });
    expect(JSON.stringify(report)).not.toContain(third.user.id);

    // Students: 403. Another teacher: 404 (as if unknown). Signed out: 401.
    expect((await heatmap(enrolled[0].cookie)).status).toBe(403);
    const other = await signedInCookie(db, { role: 'teacher' });
    expect((await heatmap(other.cookie)).status).toBe(404);
    expect(await loadClassReport(lecture.id, other.user)).toBeNull();
    expect((await heatmap()).status).toBe(401);
  });

  it('a lecture outside any class has no class report', async () => {
    const t = await signedInCookie(db, { role: 'teacher' });
    const lecture = await db.createLecture({
      title: 'Loose', courseId: 'general', mediaPath: 'data/uploads/l.mp3', mediaType: 'audio', mime: 'audio/mpeg',
      durationMs: 60_000, words: [], transcriptSource: 'none', ownerId: t.user.id,
    });
    expect(await loadClassReport(lecture.id, t.user)).toBeNull();
    expect(await loadClassReport('no-such-lecture', t.user)).toBeNull();
  });
});
