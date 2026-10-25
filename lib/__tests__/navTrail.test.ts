import { describe, expect, it } from 'vitest';
import { TRAIL_MAX, backTarget, isAppPath, recordVisit } from '../navTrail';

/** Soft (in-app) navigations through `hrefs`, starting from a fresh page load of the first. */
const visit = (...hrefs: string[]) =>
  hrefs.reduce<string[]>((trail, href, i) => recordVisit(trail, href, { fresh: i === 0 }), []);

describe('backTarget: where the toolbar’s Back leads', () => {
  it('goes back one entry to the in-app page the student came from', () => {
    expect(backTarget(visit('/progress', '/review/s1?moment=e1'), '/review/s1?moment=e1')).toEqual({
      href: '/progress',
      viaHistory: true,
    });
    expect(backTarget(visit('/teacher/l1', '/review/s1'), '/review/s1')).toEqual({ href: '/teacher/l1', viaHistory: true });
  });

  it('falls back to My notes (or the given page) when nothing in the app came before', () => {
    expect(backTarget(visit('/review/s1'), '/review/s1')).toEqual({ href: '/app', viaHistory: false });
    expect(backTarget([], '/compare/s1', '/review/s1')).toEqual({ href: '/review/s1', viaHistory: false });
  });

  it('after Finish & review, goes back to the writing screen just finished; from there, to My notes', () => {
    const trail = visit('/app', '/session/s1', '/review/s1');
    expect(backTarget(trail, '/review/s1')).toEqual({ href: '/session/s1', viaHistory: true });
    // Back one entry onto the writing screen, then Back again: where the student was before it.
    const writing = recordVisit(trail, '/session/s1', { traversal: true });
    expect(writing).toEqual(['/app', '/session/s1']);
    expect(backTarget(writing, '/session/s1')).toEqual({ href: '/app', viaHistory: true });
  });

  it('opens that writing screen when it is the previous page but not the previous history entry', () => {
    const trail = visit('/app', '/session/s1', '/review/s1', '/review/s1?moment=e1');
    expect(backTarget(trail, '/review/s1?moment=e1')).toEqual({ href: '/session/s1', viaHistory: false });
  });

  it('never lands on another session’s writing screen, or an older one', () => {
    expect(backTarget(visit('/app', '/session/s2', '/review/s1'), '/review/s1')).toEqual({ href: '/app', viaHistory: false });
    expect(backTarget(visit('/app', '/session/s1', '/progress', '/review/s1'), '/review/s1')).toEqual({
      href: '/progress',
      viaHistory: true,
    });
  });

  it('from a writing screen, skips its own Study mode instead of bouncing between the two', () => {
    // My progress → Study mode → Keep writing → Back: out of the pair, to My progress.
    expect(backTarget(visit('/progress', '/review/s1', '/session/s1'), '/session/s1')).toEqual({
      href: '/progress',
      viaHistory: false,
    });
    // Finish & review → Keep writing → Back: My notes, not Study mode (whose Back would lead here again).
    expect(backTarget(visit('/app', '/session/s1', '/review/s1', '/session/s1'), '/session/s1')).toEqual({
      href: '/app',
      viaHistory: false,
    });
    // Another session's Study mode is still a page the student came from.
    expect(backTarget(visit('/app', '/review/s2', '/session/s1'), '/session/s1')).toEqual({
      href: '/review/s2',
      viaHistory: true,
    });
  });

  it('after Keep writing → Finish, goes back to the writing screen, then out of the pair', () => {
    const trail = visit('/progress', '/review/s1', '/session/s1', '/review/s1');
    expect(backTarget(trail, '/review/s1')).toEqual({ href: '/session/s1', viaHistory: true });
    const writing = recordVisit(trail, '/session/s1', { traversal: true });
    expect(backTarget(writing, '/session/s1')).toEqual({ href: '/progress', viaHistory: false });
  });

  it('a replaced page is dropped from the trail', () => {
    let trail = visit('/app', '/session/s1');
    trail = recordVisit(trail, '/review/s1', { replaced: true });
    expect(trail).toEqual(['/app', '/review/s1']);
    expect(backTarget(trail, '/review/s1')).toEqual({ href: '/app', viaHistory: true });
  });

  it('follows browser back steps instead of piling them up', () => {
    let trail = visit('/app', '/review/s1', '/session/s1');
    trail = recordVisit(trail, '/review/s1', { traversal: true });
    expect(trail).toEqual(['/app', '/review/s1']);
    expect(backTarget(trail, '/review/s1')).toEqual({ href: '/app', viaHistory: true });
  });

  it('starts over after arriving from outside the app, but keeps going after a reload or an in-app link', () => {
    const before = visit('/app', '/progress');
    // From another site or the marketing page: what came before is unknown.
    expect(recordVisit(before, '/review/s1', { fresh: true, referrer: null })).toEqual(['/review/s1']);
    expect(recordVisit(before, '/review/s1', { fresh: true, referrer: '/welcome' })).toEqual(['/review/s1']);
    // A full load linked from the last page we know, and a reload.
    expect(recordVisit(before, '/review/s1', { fresh: true, referrer: '/progress' })).toEqual(['/app', '/progress', '/review/s1']);
    expect(recordVisit(before, '/progress?status=open', { fresh: true })).toEqual(['/app', '/progress?status=open']);
  });

  it('keeps a bounded trail and ignores pages outside the app', () => {
    const many = visit(...Array.from({ length: TRAIL_MAX + 5 }, (_, i) => `/review/s${i}`));
    expect(many).toHaveLength(TRAIL_MAX);
    expect(isAppPath('/progress')).toBe(true);
    expect(isAppPath('/welcome')).toBe(false);
    expect(isAppPath('/')).toBe(false);
    expect(isAppPath('/api/health')).toBe(false);
    expect(isAppPath('//evil.example/app')).toBe(false);
    expect(backTarget(['/welcome', '/review/s1'], '/review/s1')).toEqual({ href: '/app', viaHistory: false });
  });
});
