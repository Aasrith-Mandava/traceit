import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPhase2Scenario } from '../../e2e/fixtures/phase2-scenario';
import {
  computeInkHotspots,
  computeInkWindowStats,
  openDb,
  type Db,
  type InkHotspot,
  type InkWindowStat,
} from '../db';
import { openPostgresDb } from '../dbPostgres';
import type { ConfusionWindow, EraseEvent, HelpCard, Revision, Stroke, TimelineEvent } from '../types';

// The storage contract, run against every backend with identical expectations: SQLite (the
// default, a throwaway file) and Postgres (embedded PGlite: the non-Timescale Postgres path).
const dir = mkdtempSync(join(tmpdir(), 'traceit-contract-'));
let fileNo = 0;

const backends: Array<[name: string, open: () => Db, backend: 'sqlite' | 'postgres']> = [
  ['sqlite', () => openDb(join(dir, `contract-${fileNo++}.db`)), 'sqlite'],
  ['postgres (PGlite)', () => openPostgresDb('pglite:memory'), 'postgres'],
];

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEMO = 'demo-chain-rule';

function stroke(sessionId: string, id: string, startMs: number, over: Partial<Stroke> = {}): Stroke {
  const pressure = over.pointerType === 'mouse' ? 0.5 : 0.3 + (startMs % 7) / 20;
  return {
    id,
    sessionId,
    startMs,
    endMs: startMs + 400,
    points: [
      [10.25, 20.5, pressure, startMs],
      [30.125, 22.75, pressure + 0.1, startMs + 200],
      [55.1, 25.3, 0.30000000000000004, startMs + 400],
    ],
    pointerType: 'pen',
    bbox: [10.25, 20.5, 55.1, 25.3],
    inkLen: 45.5 + (startMs % 11),
    medianSpeed: 0.1 + (startMs % 13) / 100,
    erased: false,
    erasedAtMs: null,
    erasedBy: null,
    isScribble: false,
    splitFrom: null,
    replacedBy: null,
    ...over,
  };
}

function window(sessionId: string, bucketStartMs: number, over: Partial<ConfusionWindow> = {}): ConfusionWindow {
  return {
    sessionId,
    bucketStartMs,
    pause: 0.1,
    slowdown: 0.2,
    erase: 0.3,
    pressure: null,
    rawScore: 0.25,
    emaScore: 0.125,
    isSpike: false,
    reasons: ['slowdown'],
    phase: 'scored',
    ...over,
  };
}

function event(sessionId: string, id: string, lectureMs: number, over: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id,
    sessionId,
    lectureMs,
    type: 'unresolved_gap',
    status: 'open',
    conceptId: `${DEMO}@${lectureMs - 1000}`,
    conceptLabel: 'The chain rule',
    windowStartMs: lectureMs - 5000,
    evidence: { excerpt: 'so the derivative of the outside…', audioStartMs: lectureMs - 3000, audioEndMs: lectureMs + 3000 },
    checkAttempts: [],
    ...over,
  };
}

const help: HelpCard = {
  reexplain: 'Differentiate the outside, keep the inside, multiply by the inside’s derivative.',
  mcq: { q: 'd/dx sin(x²)?', options: ['cos(x²)', '2x cos(x²)', '2x sin(x²)'], answerIdx: 1, why: 'Chain rule.' },
  source: 'fallback',
  provider: 'fake',
};

function expectStatsClose(actual: InkWindowStat[] | InkHotspot[], expected: InkWindowStat[] | InkHotspot[]) {
  expect(actual.map((w) => w.bucketStartMs)).toEqual(expected.map((w) => w.bucketStartMs));
  actual.forEach((a, i) => {
    const e = expected[i] as unknown as Record<string, number | null>;
    for (const [key, value] of Object.entries(a)) {
      if (value === null || e[key] === null) expect([key, value]).toEqual([key, e[key]]);
      else expect(value, key).toBeCloseTo(e[key] as number, 9);
    }
  });
}

describe.each(backends)('Db contract: %s', (_name, open, backend) => {
  let db: Db;

  beforeAll(async () => {
    db = open();
    await db.info(); // connect + migrate up front (PGlite start-up is ~1 s)
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  const newSession = (over: { studentId?: string; lectureId?: string; title?: string } = {}) =>
    db.createSession({ lectureId: over.lectureId ?? DEMO, courseId: 'calc1', title: over.title ?? 't', studentId: over.studentId });

  it('reports its backend without secrets', async () => {
    const info = await db.info();
    expect(info).toEqual({ backend, timescale: false });
  });

  describe('sessions', () => {
    it('creates, reads and lists sessions (newest first, strictly increasing start times)', async () => {
      const a = await newSession({ studentId: 'st-sessions', title: '  First  ' });
      const b = await newSession({ studentId: 'st-sessions', title: '' });
      expect(a).toMatchObject({ studentId: 'st-sessions', lectureId: DEMO, title: 'First', inputKind: null, hasPressure: false });
      expect(b.title).toMatch(/^Notes · /);
      expect(a.createdAtIso < b.createdAtIso).toBe(true);
      expect(await db.getSession(a.id)).toEqual(a);
      expect(await db.getSession('s_missing')).toBeNull();
      const listed = (await db.listSessions()).filter((s) => s.studentId === 'st-sessions');
      expect(listed).toEqual([b, a]);
    });

    it('lists a student’s sessions oldest first, optionally per lecture, with the analysed flag', async () => {
      const a = await newSession({ studentId: 'st-list' });
      const other = await newSession({ studentId: 'st-list', lectureId: 'l_other' });
      await newSession({ studentId: 'someone-else' });
      await db.saveAnalysis(a.id, { durationMs: 1000, windows: [], revisions: [], events: [], inkVersion: 0 });
      expect(await db.listStudentSessions('st-list')).toEqual([
        { ...a, analyzed: true },
        { ...other, analyzed: false },
      ]);
      expect((await db.listStudentSessions('st-list', 'l_other')).map((s) => s.id)).toEqual([other.id]);
    });

    it('seeding: takes a given id and start time as-is', async () => {
      const s = await db.createSession({
        id: `seeded-${backend}`,
        createdAtIso: '2026-09-25T15:00:00.000Z',
        lectureId: DEMO,
        courseId: 'calc1',
        title: 'Seeded',
        studentId: 'st-seed',
      });
      expect(s).toMatchObject({ id: `seeded-${backend}`, createdAtIso: '2026-09-25T15:00:00.000Z' });
      expect(await db.getSession(s.id)).toEqual(s);
      // The app's own sessions still get fresh ids and "now".
      const next = await newSession({ studentId: 'st-seed' });
      expect(next.id).not.toBe(s.id);
      expect(next.createdAtIso > s.createdAtIso).toBe(true);
    });

    it('deletes a session with everything stored for it, and reports its Notability files', async () => {
      const s = await newSession({ studentId: 'st-delete' });
      const keep = await newSession({ studentId: 'st-delete' });
      await db.upsertStrokes(s.id, [stroke(s.id, `del-a-${backend}`, 1000)]);
      await db.upsertStrokes(keep.id, [stroke(keep.id, `del-b-${backend}`, 1000)]);
      await db.addEraseEvents(s.id, [{ id: `del-e-${backend}`, sessionId: s.id, atMs: 2000, strokeIds: [], by: 'eraser' }]);
      await db.saveAnalysis(s.id, { durationMs: 1000, windows: [window(s.id, 0)], revisions: [], events: [event(s.id, `del-ev-${backend}`, 500)], inkVersion: 1 });
      await db.addNotabilityImport({ sessionId: s.id, fileName: 'n.pdf', storedName: `stored-${backend}.pdf`, pageCount: 1, size: 10 });

      expect(await db.deleteSession(s.id)).toEqual({ deleted: true, notabilityFiles: [`stored-${backend}.pdf`] });
      expect(await db.getSession(s.id)).toBeNull();
      expect(await db.getStrokes(s.id)).toEqual([]);
      expect(await db.getEraseEvents(s.id)).toEqual([]);
      expect(await db.getAnalysis(s.id)).toBeNull();
      expect(await db.getEvent(`del-ev-${backend}`)).toBeNull();
      expect(await db.getNotabilityImport(s.id)).toBeNull();
      expect(await db.getStrokes(keep.id)).toHaveLength(1);
      expect(await db.deleteSession(s.id)).toEqual({ deleted: false, notabilityFiles: [] });
    });

    it('counts each session’s strokes as lines drawn and erased parts, in one query (inkCounts rules)', async () => {
      const s = await newSession({ studentId: 'st-count' });
      const k = (id: string) => `${id}-${backend}`;
      await db.upsertStrokes(s.id, [
        // A line cut by the eraser: 1 drawn, its erased middle piece is 1 erased part.
        stroke(s.id, k('cut'), 1000, { replacedBy: [k('cut-a'), k('cut-b')] }),
        stroke(s.id, k('cut-a'), 1000, { splitFrom: k('cut') }),
        stroke(s.id, k('cut-b'), 1200, { splitFrom: k('cut'), erased: true, erasedAtMs: 5000, erasedBy: 'eraser' }),
        // A scribbled-out word (1 drawn, 1 erased) and its zig-zag (a gesture: neither).
        stroke(s.id, k('word'), 2000, { erased: true, erasedAtMs: 6000, erasedBy: 'scribble' }),
        stroke(s.id, k('zig'), 5500, { isScribble: true, erased: true, erasedAtMs: 6000, erasedBy: 'scribble' }),
        // A struck word and its line.
        stroke(s.id, k('struck'), 2500, { erased: true, erasedAtMs: 7000, erasedBy: 'strike' }),
        stroke(s.id, k('bar'), 6800, { isScribble: true, erased: true, erasedAtMs: 7000, erasedBy: 'strike' }),
        // An undone stroke (neither) and a plain live one.
        stroke(s.id, k('undone'), 3000, { erased: true, erasedAtMs: 3500, erasedBy: 'undo' }),
        stroke(s.id, k('live'), 4000),
      ]);
      const counts = await db.sessionStrokeCounts();
      expect(counts.get(s.id)).toEqual({ drawn: 4, erasedParts: 3 });
      const { inkCounts } = await import('../ink');
      expect(counts.get(s.id)).toEqual(inkCounts(await db.getStrokes(s.id)));
      const empty = await newSession({ studentId: 'st-count' });
      expect(counts.has(empty.id)).toBe(false);
    });
  });

  describe('strokes', () => {
    it('upserts idempotently, keeps float values exact and returns strokes in time order', async () => {
      const s = await newSession();
      const list = [stroke(s.id, 'k_b', 2000), stroke(s.id, 'k_a', 1000, { pointerType: 'mouse' })];
      await db.upsertStrokes(s.id, list);
      await db.upsertStrokes(s.id, list);
      expect(await db.getStrokes(s.id)).toEqual([list[1], list[0]]);
      expect(await db.getInkVersion(s.id)).toBe(2);
    });

    it('overwrites by id and tracks the strongest input kind and real pen pressure', async () => {
      const s = await newSession();
      await db.upsertStrokes(s.id, [stroke(s.id, 'k_m', 0, { pointerType: 'mouse' })]);
      expect(await db.getSession(s.id)).toMatchObject({ inputKind: 'mouse', hasPressure: false });
      const pen = stroke(s.id, 'k_p', 500);
      await db.upsertStrokes(s.id, [pen]);
      expect(await db.getSession(s.id)).toMatchObject({ inputKind: 'pen', hasPressure: true });
      const erased = { ...pen, erased: true, erasedAtMs: 900, erasedBy: 'eraser' as const };
      await db.upsertStrokes(s.id, [erased]);
      expect((await db.getStrokes(s.id)).find((k) => k.id === 'k_p')).toEqual(erased);
    });

    it('keeps partial-erase lineage sticky when a stale copy is re-sent (replacedBy / splitFrom)', async () => {
      const s = await newSession();
      const parent = stroke(s.id, 'k_parent', 100);
      const cut = { ...parent, replacedBy: ['k_piece1', 'k_piece2'] };
      const piece = stroke(s.id, 'k_piece1', 100, { splitFrom: 'k_parent' });
      await db.upsertStrokes(s.id, [cut, piece]);
      await db.upsertStrokes(s.id, [parent]); // stale copy without lineage
      const stored = await db.getStrokes(s.id);
      expect(stored.find((k) => k.id === 'k_parent')!.replacedBy).toEqual(['k_piece1', 'k_piece2']);
      expect(stored.find((k) => k.id === 'k_piece1')!.splitFrom).toBe('k_parent');
      // Within one batch too.
      await db.upsertStrokes(s.id, [{ ...parent, id: 'k_p2', replacedBy: ['x'] }, { ...parent, id: 'k_p2' }]);
      expect((await db.getStrokes(s.id)).find((k) => k.id === 'k_p2')!.replacedBy).toEqual(['x']);
    });

    it('round-trips the pen size per stroke (absent = Medium) and keeps it when a copy without one is re-sent', async () => {
      const s = await newSession();
      const fine = stroke(s.id, 'k_fine', 100, { size: 0.6 });
      const bold = stroke(s.id, 'k_bold', 200, { size: 2 });
      const medium = stroke(s.id, 'k_medium', 300);
      await db.upsertStrokes(s.id, [fine, bold, medium]);
      const stored = await db.getStrokes(s.id);
      expect(stored).toEqual([fine, bold, medium]);
      expect(stored.map((k) => k.size)).toEqual([0.6, 2, undefined]);
      expect('size' in stored[2]).toBe(false);
      // Erasing re-sends the stroke; a copy without a size never resets it.
      const noSize: Stroke = { ...bold };
      delete noSize.size;
      await db.upsertStrokes(s.id, [{ ...noSize, erased: true, erasedAtMs: 900, erasedBy: 'eraser' }]);
      expect((await db.getStrokes(s.id)).find((k) => k.id === 'k_bold')).toMatchObject({ size: 2, erased: true });
    });

    it('never moves a stroke id that belongs to another session', async () => {
      const a = await newSession();
      const b = await newSession();
      await db.upsertStrokes(a.id, [stroke(a.id, 'k_owned', 100)]);
      await db.upsertStrokes(b.id, [stroke(b.id, 'k_owned', 999)]);
      expect((await db.getStrokes(a.id))[0].startMs).toBe(100);
      expect(await db.getStrokes(b.id)).toEqual([]);
    });
  });

  describe('erase events', () => {
    it('adds, re-sends by id as an update, orders by time and bumps the ink version', async () => {
      const s = await newSession();
      const e1: EraseEvent = { id: 'x_1', sessionId: s.id, atMs: 500, strokeIds: ['k1'], by: 'eraser' };
      const e2: EraseEvent = { id: 'x_2', sessionId: s.id, atMs: 200, strokeIds: ['k2', 'k3'], by: 'scribble' };
      await db.addEraseEvents(s.id, [e1, e2]);
      await db.addEraseEvents(s.id, [{ ...e1, by: 'undo' }]);
      expect(await db.getEraseEvents(s.id)).toEqual([e2, { ...e1, by: 'undo' }]);
      expect(await db.getInkVersion(s.id)).toBe(2);
      await db.addEraseEvents(s.id, []);
      expect(await db.getInkVersion(s.id)).toBe(2);
    });
  });

  describe('analysis', () => {
    it('saves and reads back windows, revisions and events; stale after new ink', async () => {
      const s = await newSession();
      const revision: Revision = {
        id: `${s.id}:rev:1`,
        sessionId: s.id,
        lectureMs: 4000,
        beforeStrokeIds: ['k1'],
        afterStrokeIds: ['k2'],
        bbox: [1, 2, 3, 4],
        kind: 'correction',
      };
      const windows = [window(s.id, 10_000, { isSpike: true, pressure: 0.5 }), window(s.id, 0, { phase: undefined })];
      const events = [event(s.id, `${s.id}:e2`, 20_000), event(s.id, `${s.id}:e1`, 4000, { type: 'misconception_corrected', revisionId: revision.id })];
      const stored = await db.saveAnalysis(s.id, { durationMs: 60_000, windows, revisions: [revision], events, inkVersion: 0 });
      expect(stored).toEqual(events);

      const got = (await db.getAnalysis(s.id))!;
      expect(got.durationMs).toBe(60_000);
      expect(got.stale).toBe(false);
      expect(got.analyzedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(got.windows).toEqual([windows[1], windows[0]]);
      expect(got.revisions).toEqual([revision]);
      expect(got.events).toEqual([events[1], events[0]]);
      expect(await db.getRevision(revision.id)).toEqual(revision);

      await db.upsertStrokes(s.id, [stroke(s.id, 'k_late', 100)]);
      expect((await db.getAnalysis(s.id))!.stale).toBe(true);
    });

    it('returns null before any analysis', async () => {
      const s = await newSession();
      expect(await db.getAnalysis(s.id)).toBeNull();
    });

    it('carries student-facing state forward across re-analysis and drops vanished events', async () => {
      const s = await newSession({ studentId: 'st-carry' });
      const e = event(s.id, `${s.id}:gap`, 30_000);
      const gone = event(s.id, `${s.id}:gone`, 40_000);
      await db.saveAnalysis(s.id, { durationMs: 1, windows: [], revisions: [], events: [e, gone], inkVersion: 0 });
      const answered: TimelineEvent = {
        ...e,
        type: 'breakthrough',
        status: 'resolved',
        help,
        checkAttempts: [{ atIso: '2026-01-01T00:00:00Z', choiceIdx: 1, correct: true }],
        resolvedBy: 'check',
        resolvedAtIso: '2026-01-01T00:00:00Z',
        resolvedInSessionId: s.id,
        reopenedAtIso: '2025-12-31T00:00:00Z',
        repeatOf: 'earlier-gap',
      };
      await db.updateEvent(answered);
      expect(await db.getEvent(e.id)).toEqual(answered);

      const again = await db.saveAnalysis(s.id, {
        durationMs: 2,
        windows: [],
        revisions: [],
        events: [e, { ...e }],
        inkVersion: 1,
      });
      expect(again).toEqual([answered]);
      expect((await db.getAnalysis(s.id))!.events).toEqual([answered]);
      expect(await db.getEvent(gone.id)).toBeNull();
    });

    it('stores help cards and revision readings on their own', async () => {
      const s = await newSession();
      const e = event(s.id, `${s.id}:h`, 5000);
      const rev: Revision = { id: `${s.id}:r`, sessionId: s.id, lectureMs: 1, beforeStrokeIds: [], afterStrokeIds: [], bbox: [0, 0, 1, 1], kind: 'micro' };
      await db.saveAnalysis(s.id, { durationMs: 1, windows: [], revisions: [rev], events: [e], inkVersion: 0 });
      await db.setEventHelp(e.id, help);
      expect((await db.getEvent(e.id))!.help).toEqual(help);
      await db.setEventHelp(e.id, null);
      expect((await db.getEvent(e.id))!.help).toBeUndefined();
      const vision = { before: 'x', after: 'y', misconception: 'sign', conceptLabel: 'Signs', cosmetic: false };
      await db.setRevisionVision(rev.id, vision);
      expect((await db.getRevision(rev.id))!.vision).toEqual(vision);
    });
  });

  describe('gaps', () => {
    it('lists a student’s gaps (optionally per lecture) in session, then lecture-time order', async () => {
      const s1 = await newSession({ studentId: 'st-gaps' });
      const s2 = await newSession({ studentId: 'st-gaps', lectureId: 'l_two' });
      const g1 = event(s1.id, `${s1.id}:g`, 9000);
      const g0 = event(s1.id, `${s1.id}:f`, 1000);
      const g2 = event(s2.id, `${s2.id}:g`, 500);
      await db.saveAnalysis(s1.id, { durationMs: 1, windows: [], revisions: [], events: [g1, g0, event(s1.id, `${s1.id}:b`, 2, { type: 'breakthrough' })], inkVersion: 0 });
      await db.saveAnalysis(s2.id, { durationMs: 1, windows: [], revisions: [], events: [g2], inkVersion: 0 });
      expect((await db.listGaps('st-gaps')).map((g) => g.id)).toEqual([g0.id, g1.id, g2.id]);
      expect((await db.listGaps('st-gaps', 'l_two')).map((g) => g.id)).toEqual([g2.id]);
    });

    it('updates several events atomically and only within their own session', async () => {
      const s = await newSession({ studentId: 'st-upd' });
      const a = event(s.id, `${s.id}:a`, 1000);
      const b = event(s.id, `${s.id}:b`, 2000);
      await db.saveAnalysis(s.id, { durationMs: 1, windows: [], revisions: [], events: [a, b], inkVersion: 0 });
      await db.updateEvents([
        { ...a, status: 'resolved', resolvedBy: 'self', resolvedAtIso: '2026-02-02T00:00:00.000Z' },
        { ...b, repeatOf: a.id },
        { ...b, repeatOf: a.id, status: 'resolved', resolvedBy: 'revisit' },
        { ...a, id: `${s.id}:missing` },
        { ...a, sessionId: 's_other', status: 'open', resolvedBy: undefined },
      ]);
      expect(await db.getEvent(a.id)).toMatchObject({ status: 'resolved', resolvedBy: 'self', resolvedAtIso: '2026-02-02T00:00:00.000Z' });
      expect(await db.getEvent(b.id)).toMatchObject({ status: 'resolved', resolvedBy: 'revisit', repeatOf: a.id });
      await db.updateEvents([]);
    });
  });

  describe('transactions', () => {
    async function seededGap(studentId: string) {
      const s = await newSession({ studentId });
      const g = event(s.id, `${s.id}:g`, 1000);
      await db.saveAnalysis(s.id, { durationMs: 1, windows: [], revisions: [], events: [g], inkVersion: 0 });
      return { s, g };
    }

    it('commits reconciliation-style read → write sequences, seeing its own writes', async () => {
      const { g } = await seededGap('st-tx1');
      const result = await db.transaction(async (tx) => {
        const [gap] = await tx.listGaps('st-tx1');
        await tx.updateEvents([{ ...gap, status: 'resolved', resolvedBy: 'revisit' }]);
        // Nested transactions join the outer one.
        await tx.transaction(async (inner) => inner.setEventHelp(gap.id, help));
        return (await tx.listGaps('st-tx1'))[0];
      });
      expect(result).toMatchObject({ id: g.id, status: 'resolved', help });
      expect(await db.getEvent(g.id)).toMatchObject({ status: 'resolved', resolvedBy: 'revisit', help });
    });

    it('rolls everything back when the function throws', async () => {
      const { s, g } = await seededGap('st-tx2');
      await expect(
        db.transaction(async (tx) => {
          await tx.updateEvents([{ ...g, status: 'resolved' }]);
          await tx.saveAnalysis(s.id, { durationMs: 9, windows: [], revisions: [], events: [], inkVersion: 5 });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await db.getEvent(g.id)).toEqual(g);
      expect((await db.getAnalysis(s.id))!.durationMs).toBe(1);
    });

    it('keeps callers outside the transaction isolated from it (never see or share a rollback)', async () => {
      const { s, g } = await seededGap('st-tx3');
      let proceed!: () => void;
      const gate = new Promise<void>((r) => (proceed = r));
      let started!: () => void;
      const inside = new Promise<void>((r) => (started = r));
      const tx = db.transaction(async (t) => {
        await t.updateEvents([{ ...g, status: 'resolved' }]);
        started();
        await gate;
        throw new Error('rolled back');
      });
      await inside;
      // Issued while the transaction is open, from outside its async context.
      const outsideRead = db.getEvent(g.id);
      const outsideWrite = db.upsertStrokes(s.id, [stroke(s.id, 'k_outside', 5)]);
      proceed();
      await expect(tx).rejects.toThrow('rolled back');
      expect(await outsideRead).toEqual(g);
      await outsideWrite;
      expect((await db.getStrokes(s.id)).map((k) => k.id)).toEqual(['k_outside']);
    });
  });

  describe('notability imports', () => {
    const input = (sessionId: string, n: number) => ({
      sessionId,
      fileName: `export ${n}.pdf`,
      storedName: `00000000-0000-4000-8000-00000000000${n}.pdf`,
      pageCount: n === 3 ? null : n,
      size: 1000 + n,
    });

    it('keeps one current import per session, history newest first', async () => {
      const s = await newSession();
      expect(await db.getNotabilityImport(s.id)).toBeNull();
      const first = await db.addNotabilityImport(input(s.id, 1));
      const second = await db.addNotabilityImport(input(s.id, 2));
      const third = await db.addNotabilityImport(input(s.id, 3));
      expect(first).toMatchObject({ sessionId: s.id, fileName: 'export 1.pdf', pageCount: 1, size: 1001, current: true });
      expect(first.createdAtIso < second.createdAtIso && second.createdAtIso < third.createdAtIso).toBe(true);
      expect(await db.getNotabilityImport(s.id)).toEqual({ import: third, storedName: input(s.id, 3).storedName });
      expect(await db.listNotabilityImports(s.id)).toEqual([
        third,
        { ...second, current: false },
        { ...first, current: false },
      ]);
    });
  });

  describe('AI cache and concept labels', () => {
    it('round-trips JSON values of any shape and overwrites by key', async () => {
      expect(await db.getAiCache('nope')).toBeNull();
      for (const [key, value] of [
        ['k-obj', { card: help, n: 1.5, nested: [1, 'two', null, { deep: true }] }],
        ['k-str', 'plain text'],
        ['k-arr', [3, 2, 1]],
      ] as const) {
        await db.putAiCache({ key, kind: 'help', provider: 'fake', model: 'm', value });
        const got = (await db.getAiCache(key))!;
        expect(got).toMatchObject({ key, kind: 'help', provider: 'fake', model: 'm', value });
        expect(got.createdAtIso).toMatch(/Z$/);
      }
      await db.putAiCache({ key: 'k-str', kind: 'help', provider: 'fake', model: 'm', value: 'changed' });
      expect((await db.getAiCache('k-str'))!.value).toBe('changed');
    });

    it('stores concept labels and relabels stored events of that concept', async () => {
      const s = await newSession();
      const e = event(s.id, `${s.id}:c`, 7000, { conceptId: 'lec-labels@6000' });
      await db.saveAnalysis(s.id, { durationMs: 1, windows: [], revisions: [], events: [e], inkVersion: 0 });
      expect(await db.getConceptLabels('lec-labels')).toEqual(new Map());
      await db.setConceptLabel('lec-labels', 'lec-labels@6000', 'Product rule');
      await db.setConceptLabel('lec-labels', 'lec-labels@6000', 'Chain rule');
      expect(await db.getConceptLabels('lec-labels')).toEqual(new Map([['lec-labels@6000', 'Chain rule']]));
      expect((await db.getEvent(e.id))!.conceptLabel).toBe('Chain rule');
    });
  });

  describe('lectures', () => {
    it('seeds the demo lecture and lists it first', async () => {
      const demo = (await db.getLecture(DEMO))!;
      expect(demo.lecture).toMatchObject({ id: DEMO, transcriptSource: 'demo', mediaType: 'audio', createdAtIso: '2000-01-01T00:00:00.000Z' });
      expect(demo.words.length).toBe(demo.lecture.wordCount);
      await db.createLecture({
        title: 'Uploaded',
        courseId: 'c',
        mediaPath: 'data/uploads/x.mp3',
        mediaType: 'audio',
        mime: 'audio/mpeg',
        durationMs: 1234.5,
        words: [],
        transcriptSource: 'none',
      });
      const list = await db.listLectures();
      expect(list[0].id).toBe(DEMO);
      expect(list.some((l) => l.title === 'Uploaded')).toBe(true);
    });

    it('creates lectures and replaces transcripts (null for unknown lectures)', async () => {
      const words = [
        { w: 'hello', startMs: 0, endMs: 300 },
        { w: 'world', startMs: 300, endMs: 650.5 },
      ];
      const l = await db.createLecture({
        id: 'l_contract',
        title: 'Video',
        courseId: 'c',
        mediaPath: 'data/uploads/v.mp4',
        mediaType: 'video',
        mime: 'video/mp4',
        durationMs: 90_000,
        words: [],
        transcriptSource: 'none',
      });
      expect(l).toMatchObject({ id: 'l_contract', wordCount: 0, transcriptSource: 'none', mediaType: 'video' });
      const updated = await db.setLectureTranscript('l_contract', words, 'whisper');
      expect(updated).toMatchObject({ wordCount: 2, transcriptSource: 'whisper', createdAtIso: l.createdAtIso });
      expect(await db.getLecture('l_contract')).toEqual({ lecture: updated, words, mediaPath: 'data/uploads/v.mp4', ownerId: null, classId: null });
      expect(await db.setLectureTranscript('l_nope', words, 'whisper')).toBeNull();
      expect(await db.getLecture('l_nope')).toBeNull();
    });

    it('updates a Live lecture: no media until the recording is attached (null for unknown lectures)', async () => {
      const l = await db.createLecture({
        id: 'l_live',
        title: 'Live',
        courseId: 'c',
        mediaPath: '',
        mediaType: 'audio',
        mime: 'audio/webm',
        durationMs: 0,
        words: [],
        transcriptSource: 'live',
      });
      expect(l).toMatchObject({ transcriptSource: 'live', live: true, durationMs: 0 });
      const words = [{ w: 'hi', startMs: 100, endMs: 400 }];
      expect(await db.setLectureTranscript('l_live', words, 'live')).toMatchObject({ wordCount: 1, live: true });
      // Only the length changes; the media fields stay.
      expect(await db.setLectureMedia('l_live', { durationMs: 1500.5 })).toMatchObject({ durationMs: 1500.5, mime: 'audio/webm', live: true });
      const done = await db.setLectureMedia('l_live', { mediaPath: 'data/uploads/r.m4a', mediaType: 'audio', mime: 'audio/mp4', durationMs: 2000 });
      expect(done).toMatchObject({ mime: 'audio/mp4', durationMs: 2000, transcriptSource: 'live', wordCount: 1 });
      expect(done!.live).toBeUndefined();
      expect(await db.getLecture('l_live')).toEqual({ lecture: done, words, mediaPath: 'data/uploads/r.m4a', ownerId: null, classId: null });
      expect(await db.setLectureMedia('l_nope', { durationMs: 5 })).toBeNull();
    });
  });

  describe('ink statistics', () => {
    it('computes per-window stats equal to the TypeScript reference (replaced, scribble and erased ink)', async () => {
      const s = await newSession({ lectureId: 'l_stats' });
      const { strokes, eraseEvents } = buildPhase2Scenario(s.id);
      const extra = [
        stroke(s.id, 'k_edge', 10_000), // exactly on a window boundary
        stroke(s.id, 'k_scribble', 10_500, { isScribble: true }),
        stroke(s.id, 'k_cut', 11_000, { replacedBy: ['k_cut_a'] }),
        stroke(s.id, 'k_cut_a', 11_000, { splitFrom: 'k_cut', erased: true, erasedAtMs: 12_000, erasedBy: 'eraser' }),
        stroke(s.id, 'k_mouse', 12_345.678, { pointerType: 'mouse' }),
        stroke(s.id, 'k_nopoints', 19_999.5, { points: [] }),
      ];
      await db.upsertStrokes(s.id, [...strokes, ...extra]);
      await db.addEraseEvents(s.id, eraseEvents);
      const stored = await db.getStrokes(s.id);
      for (const windowMs of [10_000, 7_000, 60_000]) {
        const expected = computeInkWindowStats(stored, windowMs);
        expect(expected.length).toBeGreaterThan(0);
        expectStatsClose(await db.inkWindowStats(s.id, windowMs), expected);
      }
    });

    it('counts live ink only: pieces instead of their parent, no scribble-outs', async () => {
      const s = await newSession({ lectureId: 'l_stats3' });
      await db.upsertStrokes(s.id, [
        stroke(s.id, 'k3_edge', 10_000), // exactly on a window boundary
        stroke(s.id, 'k3_scribble', 10_500, { isScribble: true }),
        stroke(s.id, 'k3_cut', 11_000, { replacedBy: ['k3_cut_a'] }),
        stroke(s.id, 'k3_cut_a', 11_000, { splitFrom: 'k3_cut', erased: true, erasedAtMs: 12_000, erasedBy: 'eraser' }),
        stroke(s.id, 'k3_before', 9_999.5),
      ]);
      expect(await db.inkWindowStats(s.id, 10_000)).toMatchObject([
        { bucketStartMs: 0, strokes: 1, erased: 0 },
        { bucketStartMs: 10_000, strokes: 2, erased: 1 },
      ]);
    });

    it('leaves undone strokes out of the ink series (an Undo is not an erase), also after a later write', async () => {
      const s = await newSession({ lectureId: 'l_stats_undo' });
      const k = stroke(s.id, 'ku_live', 3000);
      await db.upsertStrokes(s.id, [k, stroke(s.id, 'ku_undone', 4000, { erased: true, erasedAtMs: 5000, erasedBy: 'undo' })]);
      expect(await db.inkWindowStats(s.id, 10_000)).toMatchObject([{ bucketStartMs: 0, strokes: 1, erased: 0 }]);
      // Undo of a live stroke that already had a sample row.
      await db.upsertStrokes(s.id, [{ ...k, erased: true, erasedAtMs: 6000, erasedBy: 'undo' }]);
      expect(await db.inkWindowStats(s.id, 10_000)).toEqual([]);
      expect(computeInkWindowStats(await db.getStrokes(s.id), 10_000)).toEqual([]);
    });

    it('follows later writes (erased, replaced) and rejects bad window sizes', async () => {
      const s = await newSession({ lectureId: 'l_stats2' });
      const k = stroke(s.id, 'k_live', 3000);
      await db.upsertStrokes(s.id, [k]);
      expect(await db.inkWindowStats(s.id, 10_000)).toMatchObject([{ bucketStartMs: 0, strokes: 1, erased: 0 }]);
      await db.upsertStrokes(s.id, [{ ...k, erased: true, erasedAtMs: 4000, erasedBy: 'eraser' }]);
      expect(await db.inkWindowStats(s.id, 10_000)).toMatchObject([{ strokes: 1, erased: 1 }]);
      await db.upsertStrokes(s.id, [{ ...k, replacedBy: ['k_piece'] }]);
      expect(await db.inkWindowStats(s.id, 10_000)).toEqual([]);
      for (const bad of [0, 999, 1500.5, 3_600_001, Number.NaN]) {
        await expect(db.inkWindowStats(s.id, bad)).rejects.toThrow(RangeError);
      }
    });

    it('rolls up class-wide hotspots per 30 s over every session of a lecture', async () => {
      const a = await newSession({ studentId: 'st-hot-a', lectureId: 'l_hot' });
      const b = await newSession({ studentId: 'st-hot-b', lectureId: 'l_hot' });
      const c = await newSession({ lectureId: 'l_not_this_one' });
      await db.upsertStrokes(a.id, [
        stroke(a.id, 'h1', 1000),
        stroke(a.id, 'h2', 31_000, { erased: true, erasedAtMs: 32_000, erasedBy: 'eraser' }),
        // Undone (taken back, not erased): neither drawn nor erased ink, like isDrawnStroke / isErasedPart.
        stroke(a.id, 'h2u', 33_000, { erased: true, erasedAtMs: 34_000, erasedBy: 'undo' }),
      ]);
      await db.upsertStrokes(b.id, [stroke(b.id, 'h3', 29_999), stroke(b.id, 'h4', 45_000)]);
      await db.upsertStrokes(c.id, [stroke(c.id, 'h5', 1000)]);
      const all = [...(await db.getStrokes(a.id)), ...(await db.getStrokes(b.id))];
      const hot = await db.lectureInkHotspots('l_hot');
      expectStatsClose(hot, computeInkHotspots(all));
      expect(hot.map((h) => [h.bucketStartMs, h.strokes, h.erased])).toEqual([
        [0, 2, 0],
        [30_000, 2, 1],
      ]);
      expect(await db.lectureInkHotspots('l_empty')).toEqual([]);
    });
  });

  describe('accounts and classes', () => {
    const lec = (title: string) => ({
      title,
      courseId: 'c',
      mediaPath: 'data/uploads/a.mp3',
      mediaType: 'audio' as const,
      mime: 'audio/mpeg',
      durationMs: 1000,
      words: [],
      transcriptSource: 'none' as const,
    });
    const user = async (email: string, role: 'student' | 'teacher' = 'student', name = email.split('@')[0]) =>
      (await db.createUser({ email, name, role, passwordHash: 'scrypt$test' }))!;

    it('creates users (emails lowercased and unique), reads them by id and email, renames them', async () => {
      const before = await db.countAccounts();
      const u = await db.createUser({ email: '  Ada@Example.COM ', name: 'Ada', role: 'teacher', passwordHash: 'scrypt$x' });
      expect(u).toMatchObject({ email: 'ada@example.com', name: 'Ada', role: 'teacher', guest: false });
      expect(u!.id).toMatch(/^u_/);
      expect(Number.isNaN(Date.parse(u!.createdAtIso))).toBe(false);
      expect(await db.getUser(u!.id)).toEqual(u);
      expect(await db.getUser('u_missing')).toBeNull();
      expect(await db.getUserByEmail('ADA@example.com ')).toEqual({ user: u, passwordHash: 'scrypt$x' });
      expect(await db.getUserByEmail('nobody@example.com')).toBeNull();
      expect(await db.createUser({ email: 'ada@example.com', name: 'Other', role: 'student', passwordHash: null })).toBeNull();
      const guest = await db.createUser({ id: 'guest-1', email: 'g@demo.invalid', name: 'G', role: 'student', passwordHash: null });
      expect(guest).toMatchObject({ id: 'guest-1', guest: true, role: 'student' });
      expect(await db.createUser({ id: 'guest-1', email: 'g2@demo.invalid', name: 'G', role: 'student', passwordHash: null })).toBeNull();
      expect(await db.countAccounts()).toBe(before + 1); // guests have no password: not accounts
      expect(await db.setUserName(u!.id, 'Ada L.')).toMatchObject({ id: u!.id, name: 'Ada L.' });
      expect(await db.setUserName('u_missing', 'x')).toBeNull();
    });

    it('stores sign-in sessions by token hash and expires them', async () => {
      const u = await user('sess@example.com');
      const now = '2026-10-25T12:00:00.000Z';
      await db.createAuthSession({ tokenHash: 'th-live', userId: u.id, expiresAtIso: '2026-10-26T12:00:00.000Z' });
      await db.createAuthSession({ tokenHash: 'th-old', userId: u.id, expiresAtIso: '2026-10-25T11:59:59.000Z' });
      expect(await db.getAuthSessionUser('th-live', now)).toEqual(u);
      expect(await db.getAuthSessionUser('th-old', now)).toBeNull();
      expect(await db.getAuthSessionUser('th-nope', now)).toBeNull();
      expect(await db.deleteExpiredAuthSessions(now)).toBeGreaterThanOrEqual(1);
      expect(await db.getAuthSessionUser('th-live', now)).toEqual(u);
      await db.deleteAuthSession('th-live');
      expect(await db.getAuthSessionUser('th-live', now)).toBeNull();
    });

    it('creates classes with unique join codes, enrolls idempotently and lists both sides', async () => {
      const t = await user('teach@class.test', 'teacher', 'Ms T');
      const s1 = await user('s1@class.test');
      const s2 = await user('s2@class.test');
      const c = (await db.createClass({ teacherId: t.id, name: 'Calc', joinCode: 'CODE0001' }))!;
      expect(c).toMatchObject({ name: 'Calc', teacherId: t.id, teacherName: 'Ms T', joinCode: 'CODE0001' });
      expect(c.id).toMatch(/^c_/);
      expect(await db.createClass({ teacherId: t.id, name: 'Dup', joinCode: 'CODE0001' })).toBeNull();
      expect(await db.getClass(c.id)).toEqual(c);
      expect(await db.getClass('c_missing')).toBeNull();
      expect(await db.getClassByJoinCode('CODE0001')).toEqual(c);
      expect(await db.getClassByJoinCode('NOPE0000')).toBeNull();

      expect(await db.enroll(c.id, s1.id)).toBe(true);
      expect(await db.enroll(c.id, s1.id)).toBe(false);
      expect(await db.enroll(c.id, s2.id)).toBe(true);
      expect((await db.listClassStudentIds(c.id)).sort()).toEqual([s1.id, s2.id].sort());

      const c2 = (await db.createClass({ teacherId: t.id, name: 'Calc 2', joinCode: 'CODE0002' }))!;
      await db.createLecture({ ...lec('In Calc'), ownerId: t.id, classId: c.id });
      const listed = (await db.listTeacherClasses(t.id)).sort((a, b) => a.name.localeCompare(b.name));
      expect(listed).toEqual([
        { ...c, studentCount: 2, lectureCount: 1 },
        { ...c2, studentCount: 0, lectureCount: 0 },
      ]);
      expect(await db.listTeacherClasses(s1.id)).toEqual([]);
      expect(await db.listStudentClasses(s1.id)).toEqual([{ id: c.id, name: 'Calc', teacherName: 'Ms T' }]);
      expect(await db.listStudentClasses(t.id)).toEqual([]);
    });

    it('shows a user the demo lecture, their own and their classes’ lectures only', async () => {
      const t = await user('vis-t@class.test', 'teacher');
      const s = await user('vis-s@class.test');
      const o = await user('vis-o@class.test');
      const c = (await db.createClass({ teacherId: t.id, name: 'Vis', joinCode: 'CODE0003' }))!;
      await db.enroll(c.id, s.id);
      const own = await db.createLecture({ ...lec('Own'), ownerId: o.id });
      const inClass = await db.createLecture({ ...lec('Class'), ownerId: t.id, classId: c.id });
      const legacy = await db.createLecture(lec('Legacy'));
      expect(own.classId).toBeUndefined();
      expect(inClass).toMatchObject({ classId: c.id, className: 'Vis' });
      expect(await db.getLecture(inClass.id)).toMatchObject({ lecture: inClass, ownerId: t.id, classId: c.id });
      expect(await db.getLecture(legacy.id)).toMatchObject({ ownerId: null, classId: null });

      const ids = async (userId: string) => (await db.listVisibleLectures(userId)).map((l) => l.id);
      expect(await ids(s.id)).toEqual([DEMO, inClass.id]);
      expect(await ids(t.id)).toEqual([DEMO, inClass.id]);
      expect(await ids(o.id)).toEqual([DEMO, own.id]);
      expect((await db.listVisibleLectures(s.id))[1]).toEqual(inClass);
      expect(await db.canViewLecture(s.id, inClass.id)).toBe(true);
      expect(await db.canViewLecture(o.id, inClass.id)).toBe(false);
      expect(await db.canViewLecture(s.id, own.id)).toBe(false);
      expect(await db.canViewLecture(o.id, legacy.id)).toBe(false);
      expect(await db.canViewLecture(o.id, DEMO)).toBe(true);
      expect(await db.canViewLecture(o.id, 'l_missing')).toBe(false);

      // Out of the class: the student no longer sees it; the owner still does.
      expect(await db.setLectureClass(inClass.id, null)).toBe(true);
      expect(await db.canViewLecture(s.id, inClass.id)).toBe(false);
      expect(await db.canViewLecture(t.id, inClass.id)).toBe(true);
      expect((await db.getLecture(inClass.id))!.lecture.classId).toBeUndefined();
      expect(await db.setLectureClass('l_missing', null)).toBe(false);
    });

    it('scopes lecture sessions, stroke counts and hotspots to given students', async () => {
      const a = await newSession({ studentId: 'st-scope-a', lectureId: 'l_scope' });
      const b = await newSession({ studentId: 'st-scope-b', lectureId: 'l_scope' });
      const elsewhere = await newSession({ studentId: 'st-scope-a', lectureId: 'l_scope_other' });
      await db.upsertStrokes(a.id, [stroke(a.id, 'sc-a1', 1000), stroke(a.id, 'sc-a2', 31_000)]);
      await db.upsertStrokes(b.id, [stroke(b.id, 'sc-b1', 2000)]);
      await db.upsertStrokes(elsewhere.id, [stroke(elsewhere.id, 'sc-e1', 2000)]);

      expect((await db.listLectureSessions('l_scope', ['st-scope-a'])).map((s) => s.id)).toEqual([a.id]);
      expect((await db.listLectureSessions('l_scope', ['st-scope-a', 'st-scope-b'])).map((s) => s.id)).toEqual([a.id, b.id]);
      expect(await db.listLectureSessions('l_scope', [])).toEqual([]);

      expectStatsClose(await db.lectureInkHotspots('l_scope', ['st-scope-a']), computeInkHotspots(await db.getStrokes(a.id)));
      expect(await db.lectureInkHotspots('l_scope', [])).toEqual([]);
      expect(await db.lectureInkHotspots('l_scope', ['nobody'])).toEqual([]);
      expectStatsClose(
        await db.lectureInkHotspots('l_scope'),
        computeInkHotspots([...(await db.getStrokes(a.id)), ...(await db.getStrokes(b.id))]),
      );

      const counts = await db.sessionStrokeCounts('st-scope-a');
      expect([...counts.keys()].sort()).toEqual([a.id, elsewhere.id].sort());
      expect(counts.get(a.id)).toEqual({ drawn: 2, erasedParts: 0 });
      expect((await db.sessionStrokeCounts()).has(b.id)).toBe(true);
    });

    it('adopts the local student’s sessions (except kept ones) and owner-less uploads, never the demo lecture', async () => {
      const mine = await newSession({ studentId: 'st-legacy' });
      const kept = await newSession({ studentId: 'st-legacy' });
      const other = await newSession({ studentId: 'st-legacy-other' });
      const upload = await db.createLecture(lec('Old upload'));
      const owned = await db.createLecture({ ...lec('Owned'), ownerId: 'u-someone' });
      const res = await db.adoptLegacyData('st-legacy', 'u-adopter', [kept.id]);
      expect(res.sessions).toBe(1);
      expect(res.lectures).toBeGreaterThanOrEqual(1);
      expect((await db.getSession(mine.id))!.studentId).toBe('u-adopter');
      expect((await db.getSession(kept.id))!.studentId).toBe('st-legacy');
      expect((await db.getSession(other.id))!.studentId).toBe('st-legacy-other');
      expect((await db.getLecture(upload.id))!.ownerId).toBe('u-adopter');
      expect((await db.getLecture(owned.id))!.ownerId).toBe('u-someone');
      expect((await db.getLecture(DEMO))!.ownerId).toBeNull();
      expect(await db.adoptLegacyData('st-legacy', 'u-adopter', [kept.id])).toEqual({ sessions: 0, lectures: 0 });
    });
  });
});
