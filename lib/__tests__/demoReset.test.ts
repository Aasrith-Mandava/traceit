import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The periodic DEMO_MODE reset (lib/demoReset) on SQLite, through getDb(): it restores the seeded
// demo, prunes old visitor sessions, is atomic for concurrent readers and can't deadlock with an
// analysis holding the shared (student, lecture) lock.
const dir = mkdtempSync(join(tmpdir(), 'traceit-reset-'));
process.env.TRACEIT_DB_PATH = join(dir, 'reset.db');
process.env.TRACEIT_UPLOAD_DIR = join(dir, 'uploads');

let reset: typeof import('../demoReset');
let seed: typeof import('../demoSeed');
let analyze: typeof import('../analyze');
let db: ReturnType<typeof import('../db')['getDb']>;
const { DEMO_SESSIONS } = await import('../demoScenario');
const { DEMO_LECTURE } = await import('../demo');

const NOW = new Date('2026-09-27T06:00:00Z');
const HOUR = 3_600_000;
const uploadAs = async (title: string, ownerId: string | null = null) => {
  const { uploadTarget } = await import('../storage');
  const { storedFileName } = await import('../upload');
  const { abs, rel } = uploadTarget(storedFileName('.wav'));
  writeFileSync(abs, 'RIFF....WAVE');
  const lecture = await db.createLecture({
    ownerId,
    title,
    courseId: 'general',
    mediaPath: rel,
    mediaType: 'audio',
    mime: 'audio/wav',
    durationMs: 2000,
    words: [],
    transcriptSource: 'none',
  });
  return { lecture, abs };
};
const within = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);

beforeAll(async () => {
  reset = await import('../demoReset');
  seed = await import('../demoSeed');
  analyze = await import('../analyze');
  db = (await import('../db')).getDb();
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('demoResetMinutes / keepVisitorMinutes', () => {
  it('is on only in DEMO_MODE with DEMO_RESET_MINUTES set', () => {
    expect(reset.demoResetMinutes({})).toBeNull();
    expect(reset.demoResetMinutes({ DEMO_MODE: '1' })).toBeNull();
    expect(reset.demoResetMinutes({ DEMO_RESET_MINUTES: '30' })).toBeNull();
    expect(reset.demoResetMinutes({ DEMO_MODE: '1', DEMO_RESET_MINUTES: '30' })).toBe(30);
    expect(reset.demoResetMinutes({ DEMO_MODE: 'true', DEMO_RESET_MINUTES: ' 15 ' })).toBe(15);
    expect(reset.demoResetMinutes({ DEMO_MODE: '1', DEMO_RESET_MINUTES: '0' })).toBeNull();
    expect(reset.demoResetMinutes({ DEMO_MODE: '1', DEMO_RESET_MINUTES: 'soon' })).toBeNull();
    expect(reset.demoResetMinutes({ DEMO_MODE: '1', DEMO_RESET_MINUTES: '0.001' })).toBe(0.05);
  });

  it('keeps visitor sessions for 60 minutes by default', () => {
    expect(reset.keepVisitorMinutes({})).toBe(60);
    expect(reset.keepVisitorMinutes({ DEMO_KEEP_VISITOR_MINUTES: '0' })).toBe(0);
    expect(reset.keepVisitorMinutes({ DEMO_KEEP_VISITOR_MINUTES: '120' })).toBe(120);
    expect(reset.keepVisitorMinutes({ DEMO_KEEP_VISITOR_MINUTES: '-3' })).toBe(60);
  });
});

describe('resetDemo', () => {
  it('restores Maya’s sessions, prunes old visitor sessions and keeps one PDF', async () => {
    await seed.seedDemo({ now: new Date(NOW.getTime() - 5 * HOUR) });
    const seededStrokes = (await db.getStrokes(DEMO_SESSIONS.s1.id)).length;
    const seededEvents = (await db.getAnalysis(DEMO_SESSIONS.s1.id))!.events.map((e) => [e.type, e.status]);

    // A visitor draws into Maya's session and starts two sessions of their own.
    const [first] = await db.getStrokes(DEMO_SESSIONS.s1.id);
    await db.upsertStrokes(DEMO_SESSIONS.s1.id, [{ ...first, id: 'visitor-scribble' }]);
    expect((await db.getStrokes(DEMO_SESSIONS.s1.id)).length).toBe(seededStrokes + 1);
    const lecture = { lectureId: DEMO_LECTURE.lectureId, courseId: DEMO_LECTURE.courseId };
    await db.createSession({ id: 'visitor-old', studentId: 'demo-student', title: 'Old visit', createdAtIso: new Date(NOW.getTime() - 3 * HOUR).toISOString(), ...lecture });
    await db.createSession({ id: 'visitor-new', studentId: 'demo-student', title: 'New visit', createdAtIso: new Date(NOW.getTime() - 10 * 60_000).toISOString(), ...lecture });
    await db.upsertStrokes('visitor-new', [{ ...first, id: 'visitor-new-stroke' }]);

    // Concurrently: an analysis of the visitor's session (same student + lecture lock as Maya's)
    // and plain reads, which must never see the demo half-rebuilt.
    const resetting = reset.resetDemo({ DEMO_MODE: '1' }, NOW);
    const reads = Array.from({ length: 20 }, () => db.getSession(DEMO_SESSIONS.s1.id));
    const analysing = analyze.analyzeSession('visitor-new');
    const [result, sessions] = await within(Promise.all([resetting, Promise.all(reads), analysing]), 30_000);

    expect(sessions.every((s) => s?.id === DEMO_SESSIONS.s1.id)).toBe(true);
    expect(result.pruned).toBe(1);
    expect(await db.getSession('visitor-old')).toBeNull();
    expect(await db.getSession('visitor-new')).not.toBeNull();
    expect((await db.getStrokes(DEMO_SESSIONS.s1.id)).length).toBe(seededStrokes);
    expect((await db.getAnalysis(DEMO_SESSIONS.s1.id))!.events.map((e) => [e.type, e.status])).toEqual(seededEvents);
    // Session 1 was created "26 hours ago" relative to the reset.
    const s1 = (await db.getSession(DEMO_SESSIONS.s1.id))!;
    expect(NOW.getTime() - Date.parse(s1.createdAtIso)).toBe(26 * HOUR);
    // The Notability export was replaced, not duplicated.
    expect(readdirSync(join(dir, 'uploads', 'notability'))).toHaveLength(1);
  }, 60_000);

  it('can remove every visitor session and runs back to back', async () => {
    const first = await reset.resetDemo({ DEMO_MODE: '1', DEMO_KEEP_VISITOR_MINUTES: '0' }, NOW);
    expect(first.pruned).toBe(1);
    const again = await reset.resetDemo({ DEMO_MODE: '1', DEMO_KEEP_VISITOR_MINUTES: '0' }, NOW);
    expect(again.pruned).toBe(0);
    const ids = (await db.listSessions()).map((s) => s.id).sort();
    expect(ids).toEqual(seed.allDemoSessionIds().sort());
    expect(readdirSync(join(dir, 'uploads', 'notability'))).toHaveLength(1);
  }, 60_000);

  it('removes old visitor-uploaded lectures, their sessions and files, but never the demo lecture', async () => {
    // Uploaded before accounts (no owner) and by the guest Maya: both are visitor uploads.
    const addUpload = (title: string) => uploadAs(title, title.startsWith('Old') ? null : 'demo-student');
    const old = await addUpload('Old upload');
    // A session on the old upload, itself brand new: it goes with its lecture.
    await db.createSession({ id: 'visitor-on-upload', studentId: 'demo-student', title: 'Notes', lectureId: old.lecture.id, courseId: 'general' });

    // Two hours later: the upload is older than the default 60 minutes.
    const later = new Date(Date.now() + 2 * HOUR);
    const young = await addUpload('Young upload');
    const result = await reset.resetDemo({ DEMO_MODE: '1', DEMO_KEEP_VISITOR_MINUTES: '180' }, later);
    expect(result.lectures).toBe(0);
    expect(existsSync(old.abs)).toBe(true);

    const result2 = await reset.resetDemo({ DEMO_MODE: '1' }, later);
    expect(result2.lectures).toBe(2);
    expect(await db.getLecture(old.lecture.id)).toBeNull();
    expect(await db.getLecture(young.lecture.id)).toBeNull();
    expect(await db.getSession('visitor-on-upload')).toBeNull();
    expect(existsSync(old.abs)).toBe(false);
    expect(existsSync(young.abs)).toBe(false);

    // The demo lecture and Maya's sessions are untouched, and the demo lecture can't be deleted.
    expect((await db.getLecture(DEMO_LECTURE.lectureId))?.lecture.transcriptSource).toBe('demo');
    const ids = (await db.listSessions()).map((s) => s.id).sort();
    expect(ids).toEqual(seed.allDemoSessionIds().sort());
    expect(await db.deleteLecture(DEMO_LECTURE.lectureId)).toEqual({ deleted: false, mediaPath: null });
    expect(await db.getLecture(DEMO_LECTURE.lectureId)).not.toBeNull();
  }, 60_000);

  it('never touches real accounts; prunes guest-teacher uploads and expired sign-ins', async () => {
    const later = new Date(Date.now() + 3 * HOUR);
    const longAgo = new Date(later.getTime() - 2 * HOUR).toISOString();
    const real = (await db.createUser({ email: 'real@example.test', name: 'Real Teacher', role: 'teacher', passwordHash: 'scrypt$1$1$1$c2FsdA$aGFzaA' }))!;
    const ownUpload = await uploadAs('Real upload', real.id);
    await db.createSession({ id: 'real-on-demo', studentId: real.id, title: 'Mine', lectureId: DEMO_LECTURE.lectureId, courseId: DEMO_LECTURE.courseId, createdAtIso: longAgo });
    await db.createSession({ id: 'real-on-own', studentId: real.id, title: 'Mine too', lectureId: ownUpload.lecture.id, courseId: 'general', createdAtIso: longAgo });
    // An owner-less (pre-accounts) upload a real account has notes on: kept with every session on it.
    const legacy = await uploadAs('Legacy upload');
    await db.createSession({ id: 'real-on-legacy', studentId: real.id, title: 'Legacy notes', lectureId: legacy.lecture.id, courseId: 'general', createdAtIso: longAgo });
    await db.createSession({ id: 'guest-on-legacy', studentId: 'demo-student', title: 'Guest notes', lectureId: legacy.lecture.id, courseId: 'general', createdAtIso: longAgo });
    // The guest teacher's upload, with a guest session on it: removed.
    const guestUpload = await uploadAs('Guest teacher upload', 'demo-teacher');
    await db.createSession({ id: 'guest-on-guest', studentId: 'demo-student', title: 'Guest notes', lectureId: guestUpload.lecture.id, courseId: 'general', createdAtIso: longAgo });
    // Sign-ins: one expired by `later`, one still valid.
    await db.createAuthSession({ tokenHash: 'a'.repeat(64), userId: real.id, expiresAtIso: new Date(later.getTime() - HOUR).toISOString() });
    await db.createAuthSession({ tokenHash: 'b'.repeat(64), userId: real.id, expiresAtIso: new Date(later.getTime() + 30 * 24 * HOUR).toISOString() });

    const result = await reset.resetDemo({ DEMO_MODE: '1' }, later);
    expect(result.lectures).toBe(1);
    expect(result.signIns).toBe(1);
    expect(result.pruned).toBe(1); // guest-on-legacy (its lecture is kept for the real account)
    expect(await db.getLecture(guestUpload.lecture.id)).toBeNull();
    expect(existsSync(guestUpload.abs)).toBe(false);
    expect(await db.getSession('guest-on-guest')).toBeNull();
    expect(await db.getSession('guest-on-legacy')).toBeNull();

    expect(await db.getUser(real.id)).not.toBeNull();
    expect(await db.getLecture(ownUpload.lecture.id)).not.toBeNull();
    expect(existsSync(ownUpload.abs)).toBe(true);
    expect(await db.getLecture(legacy.lecture.id)).not.toBeNull();
    for (const id of ['real-on-demo', 'real-on-own', 'real-on-legacy']) expect(await db.getSession(id)).not.toBeNull();
    expect(await db.getAuthSessionUser('a'.repeat(64), later.toISOString())).toBeNull();
    expect((await db.getAuthSessionUser('b'.repeat(64), later.toISOString()))?.id).toBe(real.id);
    // The demo itself is intact.
    for (const id of seed.allDemoSessionIds()) expect(await db.getSession(id)).not.toBeNull();
    expect(await db.getUser('demo-student')).toMatchObject({ guest: true });
  }, 60_000);
});
