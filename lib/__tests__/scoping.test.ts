import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGapScenario } from '../../e2e/fixtures/phase6-scenario';
import type { Lecture, Session, TimelineEvent } from '../types';

// Accounts: every student feature is scoped to the signed-in user. Another student gets 404 (same
// as unknown) on someone else's session, event and lecture routes; signed out is 401; a lecture
// added to a class is visible to its teacher and enrolled students only. Throwaway SQLite file.
const dir = mkdtempSync(join(tmpdir(), 'traceit-scoping-'));
process.env.TRACEIT_DB_PATH = join(dir, 'test.db');
process.env.TRACEIT_UPLOAD_DIR = join(dir, 'uploads');

const HOST = 'localhost:3000';
const DEMO = 'demo-chain-rule';
type Db = ReturnType<typeof import('../db')['getDb']>;
type SignedIn = Awaited<ReturnType<typeof import('./authHelpers')['signedInCookie']>>;

let db: Db;
let signIn: typeof import('./authHelpers')['signedInCookie'];
let A: SignedIn; // owns the session / lecture
let B: SignedIn; // another student
let T: SignedIn; // a teacher
let routes: {
  sessions: typeof import('../../app/api/sessions/route');
  session: typeof import('../../app/api/sessions/[id]/route');
  timeline: typeof import('../../app/api/sessions/[id]/timeline/route');
  strokes: typeof import('../../app/api/sessions/[id]/strokes/route');
  analyze: typeof import('../../app/api/sessions/[id]/analyze/route');
  resolve: typeof import('../../app/api/events/[id]/resolve/route');
  lectures: typeof import('../../app/api/lectures/route');
  live: typeof import('../../app/api/lectures/live/route');
  media: typeof import('../../app/api/lectures/[id]/media/route');
  cues: typeof import('../../app/api/lectures/[id]/cues/route');
  openGaps: typeof import('../../app/api/lectures/[id]/open-gaps/route');
  hotspots: typeof import('../../app/api/lectures/[id]/hotspots/route');
  progress: typeof import('../../app/api/progress/route');
};
let sessionA: Session;
let gapA: TimelineEvent;
let lectureA: Lecture;

beforeAll(async () => {
  db = (await import('../db')).getDb();
  signIn = (await import('./authHelpers')).signedInCookie;
  routes = {
    sessions: await import('../../app/api/sessions/route'),
    session: await import('../../app/api/sessions/[id]/route'),
    timeline: await import('../../app/api/sessions/[id]/timeline/route'),
    strokes: await import('../../app/api/sessions/[id]/strokes/route'),
    analyze: await import('../../app/api/sessions/[id]/analyze/route'),
    resolve: await import('../../app/api/events/[id]/resolve/route'),
    lectures: await import('../../app/api/lectures/route'),
    live: await import('../../app/api/lectures/live/route'),
    media: await import('../../app/api/lectures/[id]/media/route'),
    cues: await import('../../app/api/lectures/[id]/cues/route'),
    openGaps: await import('../../app/api/lectures/[id]/open-gaps/route'),
    hotspots: await import('../../app/api/lectures/[id]/hotspots/route'),
    progress: await import('../../app/api/progress/route'),
  };
  A = await signIn(db);
  B = await signIn(db);
  T = await signIn(db, { role: 'teacher' });

  // A's session on the demo lecture, with an analysed gap.
  const created = await routes.sessions.POST(json('/api/sessions', { title: 'A notes' }, A));
  expect(created.status).toBe(201);
  sessionA = ((await created.json()) as { session: Session }).session;
  const { strokes, eraseEvents } = buildGapScenario(sessionA.id);
  await db.upsertStrokes(sessionA.id, strokes);
  await db.addEraseEvents(sessionA.id, eraseEvents);
  const analysed = await routes.analyze.POST(post(`/api/sessions/${sessionA.id}/analyze`, null, A), ctx(sessionA.id));
  expect(analysed.status).toBe(200);
  gapA = ((await analysed.json()) as { events: TimelineEvent[] }).events.find((e) => e.type === 'unresolved_gap')!;
  expect(gapA).toBeTruthy();

  // A's own Live lecture (personal: no class).
  const live = await routes.live.POST(json('/api/lectures/live', { title: 'A live' }, A));
  expect(live.status).toBe(201);
  lectureA = ((await live.json()) as { lecture: Lecture }).lecture;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: BodyInit | null, who?: SignedIn, headers: Record<string, string> = {}) {
  return new Request(`http://${HOST}${path}`, {
    method: 'POST',
    body,
    headers: { host: HOST, ...(who ? { cookie: who.cookie } : {}), ...headers },
  });
}
const json = (path: string, data: unknown, who?: SignedIn) =>
  post(path, JSON.stringify(data), who, { 'content-type': 'application/json' });
const get = (path: string, who?: SignedIn) =>
  new Request(`http://${HOST}${path}`, { headers: { host: HOST, ...(who ? { cookie: who.cookie } : {}) } });

describe('signed out', () => {
  it('gets 401 from student routes', async () => {
    expect((await routes.sessions.GET(get('/api/sessions'))).status).toBe(401);
    expect((await routes.sessions.POST(json('/api/sessions', {}))).status).toBe(401);
    expect((await routes.session.GET(get(`/api/sessions/${sessionA.id}`), ctx(sessionA.id))).status).toBe(401);
    expect((await routes.resolve.POST(json(`/api/events/${gapA.id}/resolve`, { action: 'self' }), ctx(gapA.id))).status).toBe(401);
    expect((await routes.media.GET(get(`/api/lectures/${DEMO}/media`), ctx(DEMO))).status).toBe(401);
    expect((await routes.progress.GET(get('/api/progress'))).status).toBe(401);
    const res = await routes.lectures.GET(get('/api/lectures'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in to continue.' });
  });
});

describe("another student's data", () => {
  it('lists only the caller’s sessions', async () => {
    const mine = (await (await routes.sessions.GET(get('/api/sessions', A))).json()) as { sessions: Session[] };
    // The demo-lecture session and the Live lecture's, newest first.
    expect(mine.sessions).toHaveLength(2);
    expect(mine.sessions[1].id).toBe(sessionA.id);
    expect(mine.sessions.every((s) => s.studentId === A.user.id)).toBe(true);
    const theirs = (await (await routes.sessions.GET(get('/api/sessions', B))).json()) as { sessions: Session[] };
    expect(theirs.sessions).toEqual([]);
  });

  it('404s on session routes', async () => {
    expect((await routes.session.GET(get(`/api/sessions/${sessionA.id}`, A), ctx(sessionA.id))).status).toBe(200);
    expect((await routes.session.GET(get(`/api/sessions/${sessionA.id}`, B), ctx(sessionA.id))).status).toBe(404);
    expect((await routes.timeline.GET(get(`/api/sessions/${sessionA.id}/timeline`, B), ctx(sessionA.id))).status).toBe(404);
    expect((await routes.analyze.POST(post(`/api/sessions/${sessionA.id}/analyze`, null, B), ctx(sessionA.id))).status).toBe(404);
    const write = await routes.strokes.POST(json(`/api/sessions/${sessionA.id}/strokes`, { strokes: [] }, B), ctx(sessionA.id));
    expect(write.status).toBe(404);
  });

  it('404s on event routes (and leaves the event alone)', async () => {
    const res = await routes.resolve.POST(json(`/api/events/${gapA.id}/resolve`, { action: 'self' }, B), ctx(gapA.id));
    expect(res.status).toBe(404);
    expect((await db.getEvent(gapA.id))!.status).toBe('open');
  });

  it('keeps progress and open gaps per student', async () => {
    const a = (await (await routes.progress.GET(get('/api/progress', A))).json()) as { openCount: number };
    const b = (await (await routes.progress.GET(get('/api/progress', B))).json()) as { openCount: number };
    expect(a.openCount).toBe(1);
    expect(b.openCount).toBe(0);
    const bGaps = await routes.openGaps.GET(get(`/api/lectures/${DEMO}/open-gaps`, B), ctx(DEMO));
    expect(((await bGaps.json()) as { open: unknown[] }).open).toEqual([]);
    // B can't anchor the view on A's session.
    const probe = await routes.openGaps.GET(get(`/api/lectures/${DEMO}/open-gaps?session=${sessionA.id}`, B), ctx(DEMO));
    expect(probe.status).toBe(404);
  });

  it("404s on another student's lecture; POST /api/sessions refuses it as unknown", async () => {
    expect((await routes.cues.POST(json(`/api/lectures/${lectureA.id}/cues`, { cues: [] }, B), ctx(lectureA.id))).status).toBe(404);
    expect((await routes.cues.POST(json(`/api/lectures/${lectureA.id}/cues`, { cues: [] }, A), ctx(lectureA.id))).status).toBe(200);
    expect((await routes.media.GET(get(`/api/lectures/${lectureA.id}/media`, B), ctx(lectureA.id))).status).toBe(404);
    expect((await routes.hotspots.GET(get(`/api/lectures/${lectureA.id}/hotspots`, B), ctx(lectureA.id))).status).toBe(404);
    const res = await routes.sessions.POST(json('/api/sessions', { lectureId: lectureA.id }, B));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unknown lecture' });
    const listed = (await (await routes.lectures.GET(get('/api/lectures', B))).json()) as { lectures: Lecture[] };
    expect(listed.lectures.map((l) => l.id)).toEqual([DEMO]);
  });

  it('counts hotspots from the caller’s own sessions only', async () => {
    const a = (await (await routes.hotspots.GET(get(`/api/lectures/${DEMO}/hotspots`, A), ctx(DEMO))).json()) as {
      hotspots: Array<{ erased: number }>;
    };
    const b = (await (await routes.hotspots.GET(get(`/api/lectures/${DEMO}/hotspots`, B), ctx(DEMO))).json()) as {
      hotspots: Array<{ erased: number }>;
    };
    expect(a.hotspots.reduce((n, h) => n + h.erased, 0)).toBeGreaterThan(0);
    expect(b.hotspots).toEqual([]);
  });
});

describe('class lectures', () => {
  let classLecture: Lecture;
  let enrolled: SignedIn;

  beforeAll(async () => {
    const cls = await db.createClass({ teacherId: T.user.id, name: 'Physics', joinCode: 'PHYS2026' });
    enrolled = await signIn(db);
    await db.enroll(cls!.id, enrolled.user.id);
    // The teacher adds a Live lecture to the class (a student can't name a class).
    expect((await routes.live.POST(json('/api/lectures/live', { classId: cls!.id }, A))).status).toBe(400);
    const res = await routes.live.POST(json('/api/lectures/live', { title: 'Class live', classId: cls!.id }, T));
    expect(res.status).toBe(201);
    classLecture = ((await res.json()) as { lecture: Lecture }).lecture;
    expect(classLecture).toMatchObject({ classId: cls!.id, className: 'Physics' });
    // A media file so the media route has something to serve.
    const { uploadTarget } = await import('../storage');
    const { storedFileName } = await import('../upload');
    const { abs, rel } = uploadTarget(storedFileName('.webm'));
    writeFileSync(abs, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]));
    await db.setLectureMedia(classLecture.id, { mediaPath: rel, mediaType: 'audio', mime: 'audio/webm', durationMs: 1000 });
  });

  it('is visible to the teacher and enrolled students, not to others', async () => {
    const path = `/api/lectures/${classLecture.id}/media`;
    expect((await routes.media.GET(get(path, T), ctx(classLecture.id))).status).toBe(200);
    expect((await routes.media.GET(get(path, enrolled), ctx(classLecture.id))).status).toBe(200);
    expect((await routes.media.GET(get(path, B), ctx(classLecture.id))).status).toBe(404);
    expect((await routes.sessions.POST(json('/api/sessions', { lectureId: classLecture.id }, enrolled))).status).toBe(201);
    expect((await routes.sessions.POST(json('/api/sessions', { lectureId: classLecture.id }, B))).status).toBe(400);
    const listed = (await (await routes.lectures.GET(get('/api/lectures', enrolled))).json()) as { lectures: Lecture[] };
    expect(listed.lectures.map((l) => l.id)).toContain(classLecture.id);
  });

  it('only the owner (the teacher) writes to it', async () => {
    const path = `/api/lectures/${classLecture.id}/cues`;
    expect((await routes.cues.POST(json(path, { cues: [] }, enrolled), ctx(classLecture.id))).status).toBe(404);
  });
});
