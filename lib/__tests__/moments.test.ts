import { describe, expect, it } from 'vitest';
import { momentsByImportance } from '../moments';
import type { TimelineEvent } from '../types';

type M = Pick<TimelineEvent, 'id' | 'type' | 'status' | 'lectureMs'>;
const m = (id: string, type: M['type'], status: M['status'], lectureMs: number): M => ({ id, type, status, lectureMs });

describe('momentsByImportance (the guided review order)', () => {
  it('puts open gaps first, then fixes, then aha moments, then cleared gaps; by lecture time within each', () => {
    const events = [
      m('aha', 'breakthrough', 'resolved', 10_000),
      m('cleared', 'unresolved_gap', 'resolved', 5_000),
      m('fix2', 'misconception_corrected', 'resolved', 90_000),
      m('gap2', 'unresolved_gap', 'open', 200_000),
      m('fix1', 'misconception_corrected', 'resolved', 30_000),
      m('gap1', 'unresolved_gap', 'open', 150_000),
    ];
    expect(momentsByImportance(events).map((e) => e.id)).toEqual(['gap1', 'gap2', 'fix1', 'fix2', 'aha', 'cleared']);
  });

  it('returns a new array and leaves the input alone', () => {
    const events = [m('b', 'breakthrough', 'resolved', 1), m('a', 'unresolved_gap', 'open', 2)];
    const sorted = momentsByImportance(events);
    expect(sorted).not.toBe(events);
    expect(events.map((e) => e.id)).toEqual(['b', 'a']);
    expect(momentsByImportance([])).toEqual([]);
  });
});
