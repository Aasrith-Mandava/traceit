"use client";

// Capture-page reminder of what is still fuzzy (gaps left open) from earlier sessions of this
// lecture, with "Jump to" buttons that seek the lecture to the start of each gap's sentence.
// Dismissible. A white card floating over the page's lower-right corner.
import { useState, type RefObject } from "react";
import type { ProgressThread } from "@/lib/progress";
import { formatClock } from "./LecturePlayer";
import { MomentGlyph } from "./Timeline";
import { CloseIcon } from "./icons";

/** Seeks now, or once the media knows its duration (a seek before metadata may be dropped). */
function seek(media: HTMLMediaElement, ms: number) {
  const apply = () => {
    media.currentTime = ms / 1000;
  };
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) apply();
  else media.addEventListener("loadedmetadata", apply, { once: true });
}

export default function OpenGapsBanner({
  threads,
  mediaRef,
}: {
  threads: ProgressThread[];
  mediaRef: RefObject<HTMLMediaElement | null>;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || threads.length === 0) return null;
  const n = threads.length;

  return (
    <aside
      data-testid="open-gaps-banner"
      aria-labelledby="open-gaps-title"
      className="enter-soft absolute right-3 bottom-3 z-10 flex w-[min(24rem,calc(100%-1.5rem))] flex-col gap-2 rounded-[18px] border border-line bg-chrome/95 py-2.5 pr-1.5 pl-4 shadow-lift sm:right-4 sm:bottom-4 sm:w-[min(24rem,calc(100%-2rem))]"
    >
      <div className="flex items-start gap-2">
        <p id="open-gaps-title" className="flex-1 pt-2.5 text-sm font-semibold text-balance text-ink">
          <span className="tabular-nums" data-testid="open-gaps-banner-count">{n}</span> {n === 1 ? "fuzzy spot" : "fuzzy spots"}{" "}
          in this lecture {n === 1 ? "is" : "are"} <span className="font-bold text-gap-strong">left over from last time</span>
        </p>
        <button
          type="button"
          data-testid="open-gaps-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss still fuzzy reminder"
          className="press inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] text-ink-muted hover:bg-desk hover:text-ink"
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1.5">
        {threads.map((t) => (
          <li key={t.rootId}>
            <button
              type="button"
              data-testid="open-gap-jump"
              data-seek-ms={t.seekMs}
              onClick={() => {
                if (mediaRef.current) seek(mediaRef.current, t.seekMs);
              }}
              className="press group -ml-2 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gap-soft/60"
            >
              <MomentGlyph type="unresolved_gap" size={12} className="shrink-0" />
              <span className="line-clamp-2 min-w-0 flex-1 text-pretty font-medium text-ink">{t.label}</span>
              {t.occurrences > 1 ? (
                <span className="shrink-0 text-xs font-bold text-gap-strong tabular-nums">×{t.occurrences}</span>
              ) : null}
              <span className="shrink-0 rounded-pill bg-desk px-2 py-0.5 font-mono text-xs tabular-nums text-ink-muted group-hover:bg-accent-soft group-hover:text-accent">
                Jump to {formatClock(t.latest.lectureMs)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
