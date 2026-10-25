"use client";

// "‹ Back" in the focus screens' toolbars (writing, Study mode, compare): back to wherever the student
// came from inside TraceIt (the writing screen just finished, My progress, Class insights, My notes…),
// else My notes. The pages this tab
// has shown are kept as a short trail (lib/navTrail) in sessionStorage, with an in-memory copy for
// when storage is unavailable.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { backTarget, recordVisit } from "@/lib/navTrail";
import { ChevronLeftIcon } from "./icons";

const KEY = "traceit:trail";

// This document's trail (null until the first page of this document is recorded).
let trail: string[] | null = null;
// Set right before a router.replace() / by a browser back or forward, read by the next recorded page.
let replacing = false;
let traversed = false;

function stored(): string[] {
  if (trail) return trail;
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function save(next: string[]) {
  trail = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode, quota): the in-memory copy still works for this page's life.
  }
}

function sameOriginReferrer(): string | null {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

/** Call right before router.replace(): the page being left is no longer in the history. */
export function replacingPage() {
  replacing = true;
}

/** Records every page the app shows. Mounted once, in the app's root layout. */
export function NavTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const onPop = () => {
      traversed = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const fresh = trail === null;
    const href = window.location.pathname + window.location.search;
    save(
      recordVisit(stored(), href, {
        fresh,
        referrer: fresh ? sameOriginReferrer() : null,
        replaced: replacing,
        traversal: traversed,
      }),
    );
    replacing = false;
    traversed = false;
  }, [pathname]);

  return null;
}

/**
 * The labelled Back button. Without JavaScript (or opened in a new tab) it is a plain link to
 * `fallbackHref`; otherwise it goes back one history entry when that is the right page, else opens it.
 */
export default function BackLink({ fallbackHref = "/app" }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      data-testid="back-link"
      onNavigate={(e) => {
        e.preventDefault();
        const { href, viaHistory } = backTarget(stored(), window.location.pathname + window.location.search, fallbackHref);
        if (viaHistory) router.back();
        else router.push(href);
      }}
      className="press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-0.5 rounded-[12px] bg-desk pr-3 pl-1.5 text-[15px] font-bold text-ink hover:bg-accent-soft hover:text-accent-strong active:bg-chrome-press max-[359px]:pr-1.5"
    >
      <ChevronLeftIcon size={22} />
      {/* Very narrow phones: the chevron alone; the name stays "Back" for screen readers. */}
      <span className="max-[359px]:sr-only">Back</span>
    </Link>
  );
}
