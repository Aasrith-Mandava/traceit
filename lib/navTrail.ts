// Where the toolbar's "Back" leads: a short trail of the in-app pages this tab has shown (path +
// query, newest last). It mirrors the browser history closely enough to choose between going back
// one entry (when that entry is the right page) and opening the right page. Pure; the browser glue
// (sessionStorage, popstate) lives in components/BackLink.tsx.

/** How many pages the trail keeps. */
export const TRAIL_MAX = 20;

const pathOf = (href: string) => href.split(/[?#]/)[0];

/** A page inside the app (not the marketing site at / and /welcome, not an API route). */
export function isAppPath(href: string): boolean {
  const p = pathOf(href);
  if (!p.startsWith("/") || p.startsWith("//") || p === "/") return false;
  return !/^\/(welcome|api)(\/|$)/.test(p);
}

export interface VisitInfo {
  /** The first page of a new document (a full page load, a reload, or an arrival from elsewhere). */
  fresh?: boolean;
  /** For a fresh page: the same-origin page that linked to it (document.referrer), if any. */
  referrer?: string | null;
  /** The page before was replaced (router.replace), so it is no longer in the history. */
  replaced?: boolean;
  /** A browser back / forward (popstate). */
  traversal?: boolean;
}

/** The trail after showing `href`. */
export function recordVisit(trail: string[], href: string, info: VisitInfo = {}): string[] {
  const last = trail[trail.length - 1];
  if (info.fresh) {
    // A reload (or a history step back to a page whose document was dropped): the trail still holds.
    if (last !== undefined && pathOf(last) === pathOf(href)) return [...trail.slice(0, -1), href];
    // Linked from the last page we know: carry on. Anything else (another site, the marketing page,
    // a typed URL): what came before is unknown, so start over.
    if (!(info.referrer && last !== undefined && pathOf(info.referrer) === pathOf(last))) return [href];
  }
  if (last === href) return trail;
  // A step back in the history to the page before: drop the page we left instead of adding one.
  if (info.traversal && trail.length >= 2 && pathOf(trail[trail.length - 2]) === pathOf(href)) {
    return [...trail.slice(0, -2), href];
  }
  const base = info.replaced ? trail.slice(0, -1) : trail;
  return [...base, href].slice(-TRAIL_MAX);
}

/**
 * Where Back leads from `current`, else `fallback`:
 * - Study mode right after its own writing screen (Finish & review): that writing screen.
 * - Otherwise the newest earlier page that is not this page and not a writing screen (an older one
 *   is never where the student means to land). From a writing screen its own Study mode is skipped
 *   too, so Back leaves the pair (normally to My notes) instead of bouncing between the two.
 * `viaHistory`: that page is also the previous history entry, so going back one entry gets there
 * (with its scroll position).
 */
export function backTarget(trail: string[], current: string, fallback = "/app"): { href: string; viaHistory: boolean } {
  const here = pathOf(current);
  const end = trail.length > 0 && pathOf(trail[trail.length - 1]) === here ? trail.length - 1 : trail.length;
  const id = /^\/(?:review|session)\/([^/]+)$/.exec(here)?.[1];
  const ownWriting = id && here.startsWith("/review/") ? `/session/${id}` : null;
  const ownStudy = id && here.startsWith("/session/") ? `/review/${id}` : null;
  // The previous in-app page (other than this one).
  let i = end - 1;
  while (i >= 0 && (pathOf(trail[i]) === here || !isAppPath(trail[i]))) i--;
  if (i >= 0 && pathOf(trail[i]) === ownWriting) return { href: trail[i], viaHistory: i === end - 1 };
  for (; i >= 0; i--) {
    const p = pathOf(trail[i]);
    if (p === here || p === ownStudy || p.startsWith("/session/") || !isAppPath(trail[i])) continue;
    return { href: trail[i], viaHistory: i === end - 1 };
  }
  return { href: fallback, viaHistory: false };
}
