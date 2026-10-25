"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { TranscriptSource, TranscriptWord } from "@/lib/types";
import { toParagraphs, wordIndexAt } from "@/lib/transcript";
import { formatClock } from "./LecturePlayer";
import { CloseIcon } from "./icons";
import { btnSecondary, iconBtn } from "./ui";
import { TRANSCRIBE_DEMO_MESSAGE } from "@/lib/demoMode";

/** How long auto-scroll stays paused after the student scrolls the transcript themselves. */
const USER_SCROLL_PAUSE_MS = 6000;

const SOURCE_LABEL: Record<TranscriptSource, string> = {
  demo: "Demo transcript",
  captions: "From captions",
  whisper: "Auto-transcribed",
  live: "Live transcript",
  none: "",
};

interface TranscriptPanelProps {
  words: TranscriptWord[];
  source: TranscriptSource;
  mediaRef: RefObject<HTMLMediaElement | null>;
  lectureId: string;
  aiConfigured: boolean;
  /** False in DEMO_MODE: Auto-transcribe is shown disabled, with a note (the server answers 403). */
  transcribeAvailable?: boolean;
  onClose: () => void;
  /** Called with the new words after a successful auto-transcription. */
  onTranscribed: (words: TranscriptWord[]) => void;
  id?: string;
}

/**
 * The static word list. Rendered once per transcript: following playback only toggles attributes
 * on two spans, so a playing lecture never re-renders thousands of words.
 */
const WordList = memo(function WordList({ words }: { words: TranscriptWord[] }) {
  const paragraphs = useMemo(() => toParagraphs(words), [words]);
  return (
    <>
      {paragraphs.map((p) => (
        <p key={p.first} className="grid grid-cols-[2.75rem_1fr] gap-x-2">
          <span aria-hidden="true" className="pt-0.5 font-mono text-[11px] tabular-nums text-ink-subtle select-none">
            {formatClock(p.words[0].startMs)}
          </span>
          <span className="text-pretty">
            {p.words.map((w, k) => (
              // The word's global index: stable across paragraphs and re-renders.
              <span key={p.first + k}>
                <span data-w={p.first + k} data-ms={w.startMs} className="transcript-word">
                  {w.w}
                </span>{" "}
              </span>
            ))}
          </span>
        </p>
      ))}
    </>
  );
});

function NoTranscript({
  lectureId,
  aiConfigured,
  transcribeAvailable = true,
  onTranscribed,
}: Pick<TranscriptPanelProps, "lectureId" | "aiConfigured" | "transcribeAvailable" | "onTranscribed">) {
  const [state, setState] = useState<"idle" | "working" | "unavailable" | "error">(aiConfigured ? "idle" : "unavailable");
  const [error, setError] = useState<string | null>(null);

  const transcribe = async () => {
    setState("working");
    setError(null);
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/transcribe`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { words?: TranscriptWord[]; error?: string };
      if (res.status === 503) return setState("unavailable");
      if (!res.ok || !body.words) throw new Error(body.error || `HTTP ${res.status}`);
      onTranscribed(body.words);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
      setState("error");
    }
  };

  return (
    <div data-testid="transcript-empty" className="flex flex-col items-start gap-3 px-4 py-6">
      <p className="font-display text-lg leading-tight font-bold text-ink">No captions for this lecture yet</p>
      <p className="text-sm leading-relaxed text-pretty text-ink-muted">
        Upload the lecture with a captions file (.vtt or .srt) to follow along here and see what was said at each moment.
      </p>
      {!transcribeAvailable ? (
        <div className="flex flex-col items-start gap-1.5">
          <button type="button" data-testid="transcribe" disabled aria-describedby="transcribe-demo-note" className={btnSecondary}>
            Auto-transcribe
          </button>
          <p id="transcribe-demo-note" data-testid="transcribe-note" className="text-xs text-pretty text-ink-subtle">
            {TRANSCRIBE_DEMO_MESSAGE}
          </p>
        </div>
      ) : state === "unavailable" ? (
        <p data-testid="transcribe-note" className="text-xs text-ink-subtle">
          Auto-transcribe needs an OpenAI or Groq key
        </p>
      ) : (
        <button
          type="button"
          data-testid="transcribe"
          onClick={transcribe}
          disabled={state === "working"}
          aria-busy={state === "working"}
          className={btnSecondary}
        >
          {state === "working" ? "Transcribing…" : "Auto-transcribe"}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TranscriptPanel({
  words,
  source,
  mediaRef,
  lectureId,
  aiConfigured,
  transcribeAvailable = true,
  onClose,
  onTranscribed,
  id,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [following, setFollowing] = useState(true);
  const currentRef = useRef<HTMLElement | null>(null);

  /** Scrolls the current word into the reading band (upper third) if it has drifted out. */
  const reveal = useCallback((el: HTMLElement, force = false) => {
    const box = scrollRef.current;
    if (!box) return;
    const top = el.offsetTop;
    const view = box.clientHeight;
    if (!force && top > box.scrollTop + view * 0.15 && top < box.scrollTop + view * 0.7) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: Math.max(0, top - view * 0.3), behavior: reduce ? "auto" : "smooth" });
  }, []);

  // Follow playback: binary-search the current word and move one attribute — no React renders.
  useEffect(() => {
    const media = mediaRef.current;
    const box = scrollRef.current;
    if (!media || !box || words.length === 0) return;
    const spans = box.querySelectorAll<HTMLElement>("[data-w]");
    let index = -2;
    let raf = 0;
    const apply = () => {
      const next = wordIndexAt(words, media.currentTime * 1000);
      if (next === index) return;
      index = next;
      const prev = currentRef.current;
      if (prev) {
        prev.removeAttribute("aria-current");
        prev.removeAttribute("data-testid");
      }
      const el = next >= 0 ? spans[next] : null;
      currentRef.current = el ?? null;
      if (!el) return;
      el.setAttribute("aria-current", "true");
      el.setAttribute("data-testid", "transcript-current");
      if (followRef.current) reveal(el);
    };
    const loop = () => {
      apply();
      if (!media.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    apply();
    if (currentRef.current) reveal(currentRef.current, true);
    if (!media.paused) onPlay();
    media.addEventListener("play", onPlay);
    media.addEventListener("seeked", apply);
    media.addEventListener("timeupdate", apply);
    return () => {
      cancelAnimationFrame(raf);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("seeked", apply);
      media.removeEventListener("timeupdate", apply);
    };
  }, [words, mediaRef, reveal]);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const resumeFollow = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    followRef.current = true;
    setFollowing(true);
    if (currentRef.current) reveal(currentRef.current, true);
  }, [reveal]);

  /** The student is reading on their own: hold auto-scroll for a few seconds. */
  const pauseFollow = useCallback(() => {
    followRef.current = false;
    setFollowing(false);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(resumeFollow, USER_SCROLL_PAUSE_MS);
  }, [resumeFollow]);

  const onWordClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    const media = mediaRef.current;
    if (!el || !media) return;
    media.currentTime = Number(el.dataset.ms) / 1000;
    // The clicked word is on screen already: re-enable following without a jump.
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    followRef.current = true;
    setFollowing(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) pauseFollow();
  };

  return (
    <aside
      id={id}
      aria-label="Captions"
      data-testid="transcript-panel"
      className="enter-soft absolute inset-x-0 bottom-0 z-20 flex h-[46%] flex-col overflow-hidden rounded-t-lg border-t border-line bg-chrome shadow-page lg:static lg:z-auto lg:h-auto lg:w-[21rem] lg:shrink-0 lg:rounded-lg lg:border lg:shadow-card"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-line pr-1.5 pl-4">
        <h2 className="text-base font-bold text-ink">Captions</h2>
        {SOURCE_LABEL[source] && words.length > 0 ? (
          <span className="rounded-pill bg-desk px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{SOURCE_LABEL[source]}</span>
        ) : null}
        <button
          type="button"
          data-testid="transcript-close"
          onClick={onClose}
          aria-label="Close captions"
          className={`${iconBtn} ml-auto`}
        >
          <CloseIcon size={18} />
        </button>
      </header>
      {words.length === 0 ? (
        <NoTranscript lectureId={lectureId} aiConfigured={aiConfigured} transcribeAvailable={transcribeAvailable} onTranscribed={onTranscribed} />
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            tabIndex={0}
            aria-label="Captions. Click a word to jump the lecture there."
            onClick={onWordClick}
            onWheel={pauseFollow}
            onTouchMove={pauseFollow}
            onKeyDown={onKey}
            className="transcript relative h-full overflow-y-auto overscroll-contain px-4 py-3 text-[15px] leading-7 text-ink-muted"
          >
            <WordList words={words} />
          </div>
          {!following ? (
            <button
              type="button"
              data-testid="transcript-follow"
              onClick={resumeFollow}
              className="press enter-soft absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center rounded-pill bg-night px-4 text-sm font-bold text-white shadow-lift hover:bg-night-raised"
            >
              Follow along
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}

export default memo(TranscriptPanel);
