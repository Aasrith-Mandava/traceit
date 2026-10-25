"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { motionTokens } from "@/lib/motion";
import { usePrefersReducedMotion } from "./motion/usePrefersReducedMotion";
import type { AiStatus } from "@/lib/ai/types";
import type {
  EraseEvent,
  Lecture,
  Revision,
  Session,
  Stroke,
  TimelineData,
  TimelineEvent,
  TimelineEventType,
  TranscriptWord,
} from "@/lib/types";
import { hiddenStats } from "@/lib/compare";
import type { CarriedThread, LectureGapsPayload, SelfAction } from "@/lib/progress";
import CarriedOver from "./CarriedOver";
import { activeStrokes, inkCounts } from "@/lib/ink";
import { lectureMediaUrl } from "@/lib/media";
import { MOMENT_META, momentsByImportance } from "@/lib/moments";
import { writingBelowBaseline } from "@/lib/scoring";
import InkCanvas from "./InkCanvas";
import LectureMedia from "./LectureMedia";
import MomentDetail from "./MomentDetail";
import SessionRecap from "./SessionRecap";
import Timeline, { MomentGlyph } from "./Timeline";
import { ArrowRightIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, PenIcon } from "./icons";
import { useSessionTimeline } from "./useSessionTimeline";
import { BackLink, GhostToggle, TopBar, btnPrimary, btnSecondary, iconBtn } from "./ui";

interface Props {
  session: Session;
  lecture: Lecture;
  /** The lecture's word-level transcript ([] when it has none). */
  words: TranscriptWord[];
  strokes: Stroke[];
  eraseEvents: EraseEvent[];
  /** Stored, up-to-date analysis; null when the session still needs analysing (done on mount). */
  initialTimeline: TimelineData | null;
  /** Moment to open first (from ?moment=<eventId>). */
  initialMomentId?: string | null;
  /** Gaps from earlier sessions of this lecture, as seen from this one. */
  initialCarried: CarriedThread[];
  /** Whether AI explanations are available (and from which provider). */
  ai: AiStatus;
}

type StatTone = "plain" | "ghost" | TimelineEventType;

// Literal class names per tone so Tailwind generates them: plain counts on white, the ghost count
// dashed light-indigo (it is your own ink, faded), moments on their soft tints.
const STAT_CLASS: Record<StatTone, string> = {
  plain: "border border-line bg-chrome text-ink-muted",
  ghost: "border border-dashed border-ghost bg-ghost-soft text-accent-strong",
  misconception_corrected: "bg-corrected-soft font-semibold text-corrected-strong",
  unresolved_gap: "bg-gap-soft font-semibold text-gap-strong",
  breakthrough: "bg-breakthrough-soft font-semibold text-breakthrough-strong",
};

function Stat({ label, value, testId, tone = "plain" }: { label: string; value: number; testId: string; tone?: StatTone }) {
  const moment = tone !== "plain" && tone !== "ghost" ? tone : null;
  return (
    <li className={`inline-flex min-h-11 items-center gap-2 rounded-[14px] px-3.5 py-1.5 text-sm ${STAT_CLASS[tone]}`}>
      {moment ? <MomentGlyph type={moment} size={12} /> : null}
      <span
        className={`font-display text-xl leading-none font-bold tabular-nums ${tone === "plain" ? "text-ink" : ""}`}
        data-testid={testId}
      >
        {value}
      </span>
      <span>{label}</span>
    </li>
  );
}

const plural = (type: TimelineEventType, n: number) => MOMENT_META[type].plural[n === 1 ? 0 : 1];

/** Previous / Next in the moment panel: iconBtn, dimmed at the ends. */
const navBtn = `${iconBtn} text-ink-muted disabled:cursor-not-allowed disabled:bg-transparent disabled:text-line-strong`;

/** Arrow keys keep their usual job inside form controls (the self-test's radio group, the language picker…). */
const KEEPS_ARROWS = "input, select, textarea, [contenteditable], [role=radio], [role=radiogroup], [role=slider], [role=listbox], [role=menu], [role=tablist]";

/**
 * The guided review's starting point. A ?moment= link wins (also while the analysis is still running
 * on mount); otherwise the most important moment opens by itself, without taking focus.
 */
function startGuide(timeline: TimelineData | null, momentId: string | null) {
  const order = momentsByImportance(timeline?.events ?? []).map((e) => e.id);
  const linked = momentId !== null && (timeline === null || order.includes(momentId));
  return { order, selectedId: linked ? momentId : (order[0] ?? null), focus: linked };
}

export default function ReviewView({
  session,
  lecture,
  words,
  strokes,
  eraseEvents,
  initialTimeline,
  initialMomentId = null,
  initialCarried,
  ai,
}: Props) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [showGhost, setShowGhost] = useState(true);
  const [start] = useState(() => startGuide(initialTimeline, initialMomentId));
  const [selectedId, setSelectedId] = useState<string | null>(start.selectedId);
  // Guided review: the moments in reading order (lib/moments momentsByImportance). Fixed once the
  // analysis is in, so resolving a gap mid-visit never reshuffles Previous / Next under the student.
  const [order, setOrder] = useState<string[]>(start.order);
  // Whether opening the selected moment moves focus into the panel (false for the automatic open).
  const [focusPanel, setFocusPanel] = useState(start.focus);
  // "All caught up": the student finished the last moment (offers the way back to My notes).
  const [caughtUp, setCaughtUp] = useState(false);
  const [carried, setCarried] = useState<CarriedThread[]>(initialCarried);

  const refreshCarried = useCallback(async () => {
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lecture.id)}/open-gaps?session=${encodeURIComponent(session.id)}`);
      if (res.ok) setCarried(((await res.json()) as LectureGapsPayload).carried);
    } catch (err) {
      console.error("Could not refresh carried-over gaps", err);
    }
  }, [lecture.id, session.id]);

  // Opened without a fresh analysis (e.g. from the home list): analysed on mount. A fresh analysis
  // may have resolved gaps from earlier sessions, so "Carried over" is refreshed after it.
  const { timeline, setTimeline, status, retry } = useSessionTimeline(session.id, initialTimeline, () => void refreshCarried());

  // The page as it is (strokes cut by a partial erase are represented by their pieces)…
  const active = useMemo(() => activeStrokes(strokes), [strokes]);
  // …but the summary counts lines the student drew ("1 stroke", not its 3 pieces).
  const drawn = useMemo(() => inkCounts(strokes).drawn, [strokes]);
  const strokesById = useMemo(() => new Map(strokes.map((s) => [s.id, s])), [strokes]);
  // The page is never shorter than the lowest ink (ghosts included), so nothing written is cut off.
  const inkBottom = useMemo(() => strokes.reduce((max, s) => Math.max(max, s.bbox[3]), 0), [strokes]);

  const events = useMemo(() => timeline?.events ?? [], [timeline]);

  // Analysed on mount: once the moments arrive, set the order and (unless a ?moment= link matched)
  // open the top one by itself. Only on arrival: a panel the student closed stays closed.
  const [guideSet, setGuideSet] = useState(initialTimeline !== null);
  if (!guideSet && timeline) {
    setGuideSet(true);
    const ids = momentsByImportance(timeline.events).map((e) => e.id);
    setOrder(ids);
    if (!(selectedId !== null && ids.includes(selectedId))) {
      setSelectedId(ids[0] ?? null);
      setFocusPanel(false);
    }
  }
  // Every moment, in the guide's order (any the order doesn't know yet go last, by importance).
  const ordered = useMemo(() => {
    const known = new Set(events.map((e) => e.id));
    const listed = order.filter((id) => known.has(id));
    const inOrder = new Set(listed);
    return [...listed, ...momentsByImportance(events.filter((e) => !inOrder.has(e.id))).map((e) => e.id)];
  }, [events, order]);
  const position = selectedId === null ? -1 : ordered.indexOf(selectedId);
  const prevId = position > 0 ? ordered[position - 1] : null;
  const nextId = position >= 0 && position < ordered.length - 1 ? ordered[position + 1] : null;
  // Too little writing for the baseline to fill: an empty trail says so instead of "all steady".
  const littleInk = useMemo(() => writingBelowBaseline(strokes), [strokes]);
  // Changes whenever what the recap describes does (analysis finished, a check answer, a resolve).
  const recapVersion = useMemo(
    () => `${status}:${events.map((e) => `${e.id}.${e.type}.${e.status}.${e.checkAttempts.length}`).join(",")}`,
    [status, events],
  );
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const revision = selected?.revisionId ? timeline?.revisions.find((r) => r.id === selected.revisionId) : undefined;
  // Shared with the compare page ("What the final page hides") so the two always agree.
  const stats = hiddenStats(strokes, events);
  const erased = stats.erased;
  const counts = {
    misconception_corrected: stats.corrections,
    unresolved_gap: stats.gaps,
    breakthrough: stats.breakthroughs,
  };
  const highlight = useMemo(
    () => (selected && revision ? { bbox: revision.bbox, color: MOMENT_META[selected.type].color } : null),
    [selected, revision],
  );

  /** "I get it now" / "Still confused" on the selected gap; merges the stored result. */
  const selfAction = useCallback(
    async (action: SelfAction) => {
      if (!selectedId) return;
      const res = await fetch(`/api/events/${encodeURIComponent(selectedId)}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`resolve failed: ${res.status}`);
      const { events: updated } = (await res.json()) as { events: TimelineEvent[] };
      const byId = new Map(updated.map((e) => [e.id, e]));
      setTimeline((t) => (t ? { ...t, events: t.events.map((e) => byId.get(e.id) ?? e) } : t));
      void refreshCarried();
    },
    [selectedId, refreshCarried, setTimeline],
  );

  /** Events the server changed (check answers, better concept labels): merge by id. */
  const mergeEvents = useCallback(
    (updated: TimelineEvent[]) => {
      if (updated.length === 0) return;
      const byId = new Map(updated.map((e) => [e.id, e]));
      setTimeline((t) => (t ? { ...t, events: t.events.map((e) => byId.get(e.id) ?? e) } : t));
      // A check answer can resolve (or reopen) a gap: keep "Carried over" in step.
      if (updated.some((e) => e.type === "unresolved_gap" || e.checkAttempts.length > 0)) void refreshCarried();
    },
    [setTimeline, refreshCarried],
  );

  const updateRevision = useCallback(
    (rev: Revision) => setTimeline((t) => (t ? { ...t, revisions: t.revisions.map((r) => (r.id === rev.id ? rev : r)) } : t)),
    [setTimeline],
  );

  /** The student opens a moment (a marker, Previous / Next, an arrow key): focus moves into the panel. */
  const open = useCallback((id: string | null) => {
    setFocusPanel(true);
    setCaughtUp(false);
    setSelectedId(id);
  }, []);

  const close = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    // Return focus to the marker that opened the panel.
    if (id) document.querySelector<HTMLElement>(`[data-testid="timeline-marker"][data-event-id="${CSS.escape(id)}"]`)?.focus();
  }, [selectedId]);

  /** "All caught up" on the last moment: close the panel and offer the way back to My notes. */
  const finish = useCallback(() => {
    setCaughtUp(true);
    close();
  }, [close]);

  /** ← / → move between moments while focus is in the panel (form controls keep their arrows). */
  const onPanelKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target instanceof Element && e.target.closest(KEEPS_ARROWS)) return;
    const to = e.key === "ArrowLeft" ? prevId : nextId;
    if (!to) return;
    e.preventDefault();
    open(to);
  };

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, close]);

  return (
    // Wide screens: one viewport tall, so the moment panel scrolls on its own beside the page and
    // the learning trail stays in view while reading an explanation.
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar label="Study mode toolbar">
        <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-2.5">
          <BackLink />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[11px] font-extrabold tracking-[0.12em] text-accent uppercase">
              Study mode{" "}
              <span className="font-semibold tracking-[0.02em] text-ink-subtle normal-case">· {lecture.title}</span>
            </p>
            <h1 className="truncate font-display text-[19px] leading-tight font-bold text-ink">{session.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <GhostToggle checked={showGhost} onChange={setShowGhost} />
          {/* The notes with ghost ink and every moment, then the moments list (a download). */}
          <a
            href={`/api/sessions/${encodeURIComponent(session.id)}/export`}
            download
            data-testid="download-pdf"
            aria-label="Download PDF"
            className={btnSecondary}
          >
            <DownloadIcon size={18} />
            {/* Phones: "PDF" keeps the toolbar's buttons on one row. */}
            <span className="sm:hidden">PDF</span>
            <span className="hidden sm:inline">Download PDF</span>
          </a>
          <Link href={`/session/${session.id}`} className={btnPrimary}>
            <PenIcon size={18} />
            Keep writing
          </Link>
          {/* The way out of Study mode: back to My notes. */}
          <Link href="/app" data-testid="study-done" className={btnSecondary}>
            <CheckIcon size={18} />
            Done
          </Link>
        </div>
      </TopBar>

      <div className="flex shrink-0 flex-col gap-4 px-2 pt-5 sm:px-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3">
          <ul aria-label="Session summary" className="flex flex-wrap items-center gap-2.5">
            <Stat label={drawn === 1 ? "pen stroke" : "pen strokes"} value={drawn} testId="count-strokes" />
            <Stat label={erased === 1 ? "ghost saved" : "ghosts saved"} value={erased} testId="count-erased" tone="ghost" />
            <Stat
              label={eraseEvents.length === 1 ? "time you erased" : "times you erased"}
              value={eraseEvents.length}
              testId="count-erase-events"
            />
            <li aria-hidden="true" className="mx-1 hidden h-[30px] w-px bg-line-strong sm:block" />
            <Stat
              label={plural("misconception_corrected", counts.misconception_corrected)}
              value={counts.misconception_corrected}
              testId="count-corrected"
              tone="misconception_corrected"
            />
            <Stat
              label={plural("unresolved_gap", counts.unresolved_gap)}
              value={counts.unresolved_gap}
              testId="count-gaps"
              tone="unresolved_gap"
            />
            <Stat
              label={plural("breakthrough", counts.breakthrough)}
              value={counts.breakthrough}
              testId="count-breakthroughs"
              tone="breakthrough"
            />
          </ul>

          <SessionRecap sessionId={session.id} serverVoice={ai.tts} version={recapVersion} />
        </div>

        <Timeline
          status={status}
          durationMs={timeline?.durationMs ?? lecture.durationMs}
          events={events}
          windows={timeline?.windows ?? []}
          baseline={timeline?.baseline ?? []}
          selectedId={selectedId}
          onSelect={open}
          onRetry={retry}
          littleInk={littleInk}
        />

        {caughtUp ? (
          <p
            data-testid="caught-up"
            className="enter-soft -mt-1 flex flex-wrap items-center gap-x-2 self-start rounded-[14px] bg-ok-soft py-0.5 pr-1 pl-3.5 text-sm font-bold text-ok-strong"
          >
            <CheckIcon size={16} strokeWidth={2.6} />
            All caught up
            <span aria-hidden="true">·</span>
            <Link
              href="/app"
              data-testid="caught-up-home"
              className="press inline-flex min-h-11 items-center gap-1 rounded-[10px] px-2.5 text-accent hover:bg-accent-soft hover:text-accent-press"
            >
              Back to my notes
              <ArrowRightIcon size={14} />
            </Link>
          </p>
        ) : null}
        {/* Says so to screen readers too (focus goes back to the trail when the panel closes). */}
        <p role="status" className="sr-only">
          {caughtUp ? "All caught up — you’ve looked at every moment." : ""}
        </p>

        <CarriedOver threads={carried} sessionId={session.id} />
      </div>

      {/* One shared, persistent media element for replays. A video lecture shows as a compact
          floating player (collapsible); audio has no visual. */}
      <LectureMedia
        src={lectureMediaUrl(lecture.id)}
        mediaType={lecture.mediaType}
        title={lecture.title}
        mediaRef={mediaRef}
        className="fixed bottom-4 left-4 z-30"
      />

      {/* No max width on the page: ink is stored in page pixels, so the page gets the full width
          (the same small gutters as capture) and nothing written near the right edge is cut off. */}
      <main className="flex min-h-[420px] flex-1 flex-col gap-2 px-2 pt-4 pb-7 sm:gap-4 sm:px-4 lg:min-h-0 lg:flex-row lg:px-6">
        {/* The panel slides in beside the page (never around it: the canvas is not in a transformed
            container). Switching moments swaps the content in place; only opening/closing animates. */}
        <AnimatePresence initial={false}>
        {selected && timeline ? (
          <motion.aside
            key="moment-details"
            aria-label="Moment details"
            onKeyDown={onPanelKey}
            initial={{ opacity: 0, x: motionTokens.distance.md }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: motionTokens.distance.md }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: motionTokens.duration.fast + 0.04, ease: motionTokens.easing.smooth }
            }
            className="order-first shrink-0 rounded-[20px] border border-line bg-chrome p-5 shadow-card sm:p-[22px] lg:order-last lg:w-[23rem] lg:overflow-y-auto lg:overscroll-contain"
          >
            {/* The panel's header: ‹ 2 of 3 › through the moments (most important first), and close. */}
            <div className="-mt-1.5 mb-3.5 flex items-center justify-between gap-2">
              <div role="group" aria-label="Moments, most important first" className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="moment-prev"
                  aria-label="Previous moment"
                  disabled={!prevId}
                  onClick={() => prevId && open(prevId)}
                  className={navBtn}
                >
                  <ChevronLeftIcon size={20} />
                </button>
                <p
                  data-testid="moment-position"
                  aria-live="polite"
                  className="min-w-[3.75rem] text-center text-sm font-bold tabular-nums text-ink-muted"
                >
                  <span className="sr-only">Moment </span>
                  {position + 1} of {ordered.length}
                </p>
                <button
                  type="button"
                  data-testid="moment-next"
                  aria-label="Next moment"
                  disabled={!nextId}
                  onClick={() => nextId && open(nextId)}
                  className={navBtn}
                >
                  <ChevronRightIcon size={20} />
                </button>
              </div>
              <button type="button" onClick={close} aria-label="Close moment details" className={`${iconBtn} text-ink-muted`}>
                <CloseIcon size={18} />
              </button>
            </div>
            <MomentDetail
              key={selected.id}
              event={selected}
              words={words}
              transcriptSource={lecture.transcriptSource}
              mediaRef={mediaRef}
              windows={timeline.windows}
              revision={revision}
              pageStrokes={active}
              strokesById={strokesById}
              autoFocus={focusPanel}
              footer={
                nextId ? (
                  <button type="button" data-testid="moment-continue" onClick={() => open(nextId)} className={`${btnPrimary} w-full`}>
                    Next moment
                    <ArrowRightIcon size={18} />
                  </button>
                ) : (
                  <button type="button" data-testid="moment-continue" data-last="true" onClick={finish} className={`${btnPrimary} w-full`}>
                    All caught up
                    <CheckIcon size={18} strokeWidth={2.4} />
                  </button>
                )
              }
              onSelfAction={selfAction}
              ai={ai}
              onEventsChange={mergeEvents}
              onRevisionChange={updateRevision}
            />
          </motion.aside>
        ) : null}
        </AnimatePresence>
        {/* The notebook page: warm paper, faint rules, pink margin; erased ink shows as ghosts. The
            hairline is an inset ring (not a border) so the canvas keeps every pixel of width, and the
            handwritten caption sits under the page, never over the ink. On wide screens the page
            column scrolls on its own when the notes run taller than the window. */}
        <div className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <div className="flex shrink-0 grow flex-col" style={{ minHeight: inkBottom + 48 }}>
            <InkCanvas
              strokes={strokes}
              showGhost={showGhost}
              readOnly
              testId="review-canvas"
              highlight={highlight}
              className="paper min-h-[420px] flex-1 rounded-[18px] shadow-page ring-1 ring-line ring-inset"
            />
          </div>
          {showGhost && erased > 0 ? (
            <span aria-hidden="true" className="hand-note -rotate-[2deg] self-end pr-4 text-2xl">
              faded = what you rubbed out
            </span>
          ) : null}
        </div>
      </main>
    </div>
  );
}
