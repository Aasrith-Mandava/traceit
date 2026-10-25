"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { formatClock } from "@/lib/time";
import { PauseIcon, PlayIcon } from "./icons";

// Re-exported for existing client imports; server code uses @/lib/time directly.
export { formatClock };

interface LecturePlayerProps {
  title: string;
  durationMs: number;
  /** The lecture's media element (rendered by <LectureMedia>). */
  mediaRef: RefObject<HTMLMediaElement | null>;
  /** Buttons shown after the clock (e.g. the transcript toggle). */
  actions?: ReactNode;
  /** Optional quiet status shown at the end of the band. */
  aside?: ReactNode;
  /** Show the "Press ▶" hint while the lecture is paused (hidden while it plays). */
  hint?: boolean;
}

/**
 * The dark lecture band under the toolbar: lime play/pause, progress and clock for the shared media
 * element, then the caller's actions (Captions) and aside (hesitation chip, ink counts).
 */
export default function LecturePlayer({ title, durationMs, mediaRef, actions, aside, hint = false }: LecturePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const a = mediaRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      setTimeMs(a.currentTime * 1000);
      if (!a.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      setTimeMs(a.currentTime * 1000);
    };
    const onTime = () => setTimeMs(a.currentTime * 1000);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("seeked", onTime);
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.removeEventListener("seeked", onTime);
    };
  }, [mediaRef]);

  const toggle = async () => {
    const a = mediaRef.current;
    if (!a) return;
    if (a.paused) {
      try {
        setError(null);
        await a.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start the lecture");
      }
    } else {
      a.pause();
    }
  };

  const progress = durationMs > 0 ? Math.min(1, timeMs / durationMs) : 0;
  const showHint = hint && !playing;

  return (
    <section
      aria-label="Lecture"
      className="flex min-h-[var(--tape-h)] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 bg-night px-3 py-2.5 text-white sm:gap-x-5 sm:px-6"
    >
      <button
        type="button"
        data-testid="play-toggle"
        data-state={playing ? "playing" : "paused"}
        onClick={toggle}
        aria-label={playing ? "Pause lecture" : "Play lecture"}
        aria-describedby={showHint ? "play-hint" : undefined}
        className="press inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-highlight text-on-highlight hover:bg-highlight-strong"
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} className="translate-x-px" />}
      </button>
      <span className="hidden max-w-[16rem] truncate text-sm font-semibold text-night-text md:block">{title}</span>
      <div className="relative flex min-w-[9rem] flex-1 items-center gap-3">
        {/* While paused: "Press ▶" laid over the start of the (still) progress bar — and over the
            clock on narrow phones — so the band never changes height and the page never moves. */}
        {showHint ? (
          <p
            id="play-hint"
            data-testid="play-hint"
            className="enter-soft pointer-events-none absolute -inset-y-1.5 -left-3 z-[1] flex max-w-[calc(100%+0.75rem)] items-center bg-night pr-3 pl-3 text-[13px] leading-tight font-semibold text-pretty text-highlight"
          >
            <span>
              Press <span aria-hidden="true">▶</span>
              <span className="sr-only"> play</span> — your notes are timed to the lecture.
            </span>
          </p>
        ) : null}
        {/* Progress: indigo → lime fill and a white thumb (decorative; the clock says the same). */}
        <div aria-hidden="true" className="relative h-1.5 min-w-12 flex-1 rounded-pill bg-night-line">
          <div
            className="absolute inset-0 origin-left rounded-pill bg-linear-to-r from-accent-light to-highlight"
            style={{ transform: `scaleX(${progress})` }}
          />
          <span
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-white shadow-[0_0_0_4px_rgb(217_249_157/0.25)]"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
        <div className="shrink-0 font-mono text-[13px] tabular-nums text-white">
          <span data-testid="lecture-time">{formatClock(timeMs)}</span>
          <span className="text-night-text/70"> / {formatClock(durationMs)}</span>
        </div>
      </div>
      {error ? (
        <span role="alert" className="max-w-[12rem] truncate text-sm font-medium text-red-300" title={error}>
          {error}
        </span>
      ) : null}
      {actions}
      {aside}
    </section>
  );
}
