"use client";

import { memo, useEffect, useId, useRef, type ReactNode } from "react";
import { LIVE_DEMO_MESSAGE, LIVE_LANGUAGES, type LiveCue } from "@/lib/liveLecture";
import { formatClock } from "@/lib/time";
import { CloseIcon, PauseIcon, PlayIcon } from "./icons";
import { iconBtn } from "./ui";
import type { LiveCapture } from "./useLiveCapture";

/** The session clock as text, updated a few times a second without re-rendering the page. */
function LiveClockText({ getMs }: { getMs: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      if (ref.current) ref.current.textContent = formatClock(getMs());
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [getMs]);
  return <span ref={ref} data-testid="lecture-time" />;
}

interface BarProps {
  live: LiveCapture;
  title: string;
  /** False in DEMO_MODE: the controls are shown but disabled, with a note. */
  available: boolean;
  actions?: ReactNode;
  aside?: ReactNode;
}

/**
 * Replaces the lecture player for a Live lecture, in the same dark band: Start / Pause, the mic
 * status pill (pink live dot and level meter while listening), the session clock and the
 * recognition language. A quiet strip underneath says what the microphone is doing and discloses
 * that speech is transcribed by the browser's speech service.
 */
export function LiveLectureBar({ live, title, available, actions, aside }: BarProps) {
  const langId = useId();
  const { status, mic, support, attachLevel, getMs, language, setLanguage, saveError, speechError, micSilent, start, pause } =
    live;
  const running = status === "running";
  const listening = running && mic === "on";
  const canStart = available && status !== "starting" && status !== "ended";

  const quiet = "border-white/15 bg-white/5 text-night-text";
  const pill = listening
    ? { label: "Listening", tone: "border-breakthrough/50 bg-breakthrough/15 text-margin", dot: "bg-breakthrough" }
    : running
      ? { label: "Notes only", tone: quiet, dot: "bg-night-text/60" }
      : status === "paused"
        ? { label: "Paused", tone: quiet, dot: "bg-gap" }
        : status === "starting"
          ? { label: "Starting…", tone: quiet, dot: "bg-night-text/60" }
          : status === "ended"
            ? { label: "Ended", tone: quiet, dot: "bg-night-text/60" }
            : { label: "Ready", tone: quiet, dot: "bg-night-text/60" };

  let note: ReactNode;
  let noteTone = "text-night-text";
  if (!available) {
    note = LIVE_DEMO_MESSAGE;
  } else if (mic === "blocked") {
    noteTone = "text-red-300";
    note = "Microphone blocked — allow it from the address bar to transcribe. Your notes are still timed from Start.";
  } else if (mic === "unavailable" || (support && !support.mic)) {
    note = support?.secure === false
      ? "The microphone needs HTTPS or localhost, so there’s no live transcript here. You can still take notes, timed from Start."
      : "No microphone is available, so there’s no live transcript. You can still take notes, timed from Start.";
  } else if (micSilent && mic === "on") {
    noteTone = "text-red-300";
    note =
      "Your microphone is sending pure silence, so there’s nothing to transcribe. Allow this browser in System Settings → Privacy & Security → Microphone (then restart it), or pick another input device.";
  } else if (support && !support.speech) {
    note = "This browser can’t transcribe speech (try Chrome or Edge). You can still take notes, timed from Start.";
  } else if (speechError) {
    noteTone = "text-red-300";
    note = speechError;
  } else if (mic === "on" && status !== "ended") {
    note = (
      <>
        <span className="font-bold text-margin">Microphone on</span>
        {running ? "" : " (paused, not recording)"} · Speech is transcribed by your browser’s speech service.
      </>
    );
  } else {
    note = "Press Start to begin. TraceIt asks for the microphone only then. Speech is transcribed by your browser’s speech service.";
  }

  return (
    <div className="shrink-0 bg-night text-white">
      <section
        aria-label="Live lecture"
        className="flex min-h-[var(--tape-h)] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:gap-x-4 sm:px-6"
      >
        <button
          type="button"
          data-testid="live-toggle"
          data-state={running ? "running" : status}
          onClick={() => void (running ? pause() : start())}
          disabled={!canStart}
          aria-label={running ? "Pause live lecture" : status === "paused" ? "Resume live lecture" : "Start live lecture"}
          className="press group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-pill pr-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="inline-flex size-10 items-center justify-center rounded-pill bg-highlight text-on-highlight transition-colors group-hover:bg-highlight-strong group-disabled:group-hover:bg-highlight">
            {running ? <PauseIcon size={16} /> : <PlayIcon size={16} className="translate-x-px" />}
          </span>
          {running ? "Pause" : status === "paused" ? "Resume" : "Start"}
        </button>

        <span
          data-testid="mic-pill"
          data-state={listening ? "listening" : status}
          role="status"
          aria-label={listening ? "Microphone on — listening" : pill.label}
          className={`inline-flex min-h-8 shrink-0 items-center gap-2 rounded-pill border px-3 text-xs font-bold tracking-wide uppercase ${pill.tone}`}
        >
          <span aria-hidden="true" className={`size-2 rounded-pill ${pill.dot}`} />
          {pill.label}
          {listening ? (
            <span aria-hidden="true" className="relative hidden h-1.5 w-10 overflow-hidden rounded-pill bg-breakthrough/25 sm:block">
              <span
                ref={attachLevel}
                data-testid="mic-level"
                className="absolute inset-0 origin-left rounded-pill bg-margin"
                style={{ transform: "scaleX(0)" }}
              />
            </span>
          ) : null}
        </span>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:justify-start">
          <span className="hidden max-w-[16rem] truncate text-sm font-semibold text-night-text md:block">{title}</span>
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-white sm:ml-auto">
            <LiveClockText getMs={getMs} />
          </span>
        </div>

        <label htmlFor={langId} className="sr-only">
          Speech language
        </label>
        <select
          id={langId}
          data-testid="live-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={!available || support?.speech === false}
          className="hidden min-h-11 max-w-[9.5rem] cursor-pointer truncate rounded-[10px] border border-white/20 bg-night-raised px-3 text-sm text-white [color-scheme:dark] transition-colors hover:border-accent-light disabled:cursor-not-allowed disabled:opacity-60 sm:block"
        >
          {LIVE_LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label}
            </option>
          ))}
        </select>
        {actions}
        {aside}
      </section>
      <p data-testid="live-note" className={`border-t border-white/10 px-3 py-1.5 text-xs text-pretty sm:px-6 ${noteTone}`}>
        {note}
        {saveError ? <span className="text-red-300"> {saveError}</span> : null}
      </p>
    </div>
  );
}

/**
 * The live captions: final cues as timestamped lines, the words being heard in grey below. A white
 * card beside the page on wide screens, a sheet over its lower part on narrow ones.
 */
export const LiveTranscriptPanel = memo(function LiveTranscriptPanel({
  cues,
  interim,
  speechSupported,
  onClose,
  id,
}: {
  cues: LiveCue[];
  interim: string;
  speechSupported: boolean;
  onClose: () => void;
  id?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Keep the newest words in view unless the student scrolled up to read.
  useEffect(() => {
    const box = scrollRef.current;
    if (box && stickRef.current) box.scrollTop = box.scrollHeight;
  }, [cues, interim]);

  return (
    <aside
      id={id}
      aria-label="Live captions"
      data-testid="live-transcript"
      className="absolute inset-x-0 bottom-0 z-20 flex h-[40%] flex-col overflow-hidden rounded-t-lg border-t border-line bg-chrome shadow-page lg:static lg:z-auto lg:h-auto lg:w-[21rem] lg:shrink-0 lg:rounded-lg lg:border lg:shadow-card"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-line pr-1.5 pl-4">
        <h2 className="text-base font-bold text-ink">Captions</h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-breakthrough-soft px-2.5 py-0.5 text-xs font-bold text-breakthrough-strong">
          <span aria-hidden="true" className="size-1.5 rounded-pill bg-breakthrough" />
          Live
        </span>
        <button type="button" data-testid="transcript-close" onClick={onClose} aria-label="Close captions" className={`${iconBtn} ml-auto`}>
          <CloseIcon size={18} />
        </button>
      </header>
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-live="polite"
        aria-label="Live captions text"
        onScroll={(e) => {
          const b = e.currentTarget;
          stickRef.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 text-[15px] leading-7 text-ink-muted"
      >
        {cues.length === 0 && !interim ? (
          <p data-testid="live-transcript-empty" className="px-1 text-sm text-pretty text-ink-subtle">
            {speechSupported
              ? "What the lecturer says appears here once you press Start."
              : "No live transcript in this browser. Notes still work, and they’re timed from Start."}
          </p>
        ) : null}
        {cues.map((c) => (
          <p key={c.startMs} data-testid="live-cue" className="grid grid-cols-[2.75rem_1fr] gap-x-2">
            <span aria-hidden="true" className="pt-0.5 font-mono text-[11px] tabular-nums text-ink-subtle select-none">
              {formatClock(c.startMs)}
            </span>
            <span className="text-pretty text-ink">{c.text}</span>
          </p>
        ))}
        {interim ? (
          <p data-testid="live-interim" className="grid grid-cols-[2.75rem_1fr] gap-x-2">
            <span aria-hidden="true" />
            <span className="text-pretty text-ink-subtle italic">{interim}</span>
          </p>
        ) : null}
      </div>
    </aside>
  );
});
