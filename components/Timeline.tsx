"use client";

import { useId, useMemo } from "react";
import type { ConfusionWindow, TimeRange, TimelineEvent, TimelineEventType } from "@/lib/types";
import { MOMENT_META, MOMENT_ORDER } from "@/lib/moments";
import { SCORING_CONFIG } from "@/lib/scoring";
import { formatClock } from "./LecturePlayer";

export type TimelineStatus = "analyzing" | "ready" | "error";

// Literal class names per type so Tailwind generates them.
const GLYPH_CLASS: Record<TimelineEventType, string> = {
  misconception_corrected: "fill-corrected stroke-paper",
  unresolved_gap: "fill-paper stroke-gap",
  breakthrough: "fill-breakthrough stroke-paper",
};
const GUIDE_CLASS: Record<TimelineEventType, string> = {
  misconception_corrected: "bg-corrected",
  unresolved_gap: "bg-gap",
  breakthrough: "bg-breakthrough",
};

/**
 * Shape + colour coded so a moment never relies on colour alone:
 * Fixed = filled green dot, Still fuzzy = open orange ring, Aha moment = pink diamond.
 */
export function MomentGlyph({ type, size = 14, className = "" }: { type: TimelineEventType; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={`${GLYPH_CLASS[type]} ${className}`}>
      {type === "misconception_corrected" ? <circle cx="8" cy="8" r="6.25" strokeWidth="1.5" /> : null}
      {type === "unresolved_gap" ? <circle cx="8" cy="8" r="5.5" strokeWidth="2.75" /> : null}
      {type === "breakthrough" ? <path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" strokeWidth="1.5" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function momentAriaLabel(e: TimelineEvent): string {
  return `${MOMENT_META[e.type].label} at ${formatClock(e.lectureMs)}, ${e.status === "open" ? "open" : "resolved"}`;
}

/** Area path (viewBox 0 0 1000 100) of the smoothed hesitation score per 10 s window. */
function sparkPath(windows: ConfusionWindow[], durationMs: number): string | null {
  if (windows.length === 0 || durationMs <= 0) return null;
  const x = (ms: number) => ((Math.min(ms, durationMs) / durationMs) * 1000).toFixed(1);
  const y = (score: number) => (100 - Math.min(1, Math.max(0, score)) * 82).toFixed(1);
  const half = SCORING_CONFIG.windowMs / 2;
  const pts = windows.map((w) => `L${x(w.bucketStartMs + half)} ${y(w.emaScore)}`);
  return `M0 100 L0 ${y(windows[0].emaScore)} ${pts.join(" ")} L1000 ${y(windows[windows.length - 1].emaScore)} L1000 100Z`;
}

/** Position (% of track) per event; nearby markers alternate lanes so their hit areas don't stack. */
function placeMarkers(events: TimelineEvent[], durationMs: number) {
  const out: Array<{ e: TimelineEvent; pct: number; lane: 0 | 1 }> = [];
  for (const e of [...events].sort((a, b) => a.lectureMs - b.lectureMs)) {
    const pct = durationMs > 0 ? Math.min(100, Math.max(0, (e.lectureMs / durationMs) * 100)) : 0;
    const prev = out[out.length - 1];
    const lane: 0 | 1 = prev && pct - prev.pct < 4 ? (prev.lane === 0 ? 1 : 0) : 0;
    out.push({ e, pct, lane });
  }
  return out;
}

interface TimelineProps {
  status: TimelineStatus;
  durationMs: number;
  events: TimelineEvent[];
  windows: ConfusionWindow[];
  /** Where the student's baseline was measured (see TimelineData.baseline); [] before analysis. */
  baseline: TimeRange[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRetry: () => void;
  /**
   * The student wrote for less time than the baseline needs (lib/scoring writingBelowBaseline): an
   * empty trail then means "not enough writing yet", not "nothing went wrong".
   */
  littleInk?: boolean;
}

/**
 * "Your learning trail": a white card with the lecture as a track — the "your normal pace" zone, the
 * hesitation sparkline (indigo) and one shape-coded marker per moment — between 00:00 and the end.
 */
export default function Timeline({
  status,
  durationMs,
  events,
  windows,
  baseline,
  selectedId,
  onSelect,
  onRetry,
  littleInk = false,
}: TimelineProps) {
  const spark = useMemo(() => sparkPath(windows, durationMs), [windows, durationMs]);
  // Unique per instance (and safe inside url(#…)): React ids carry characters CSS would need escaped.
  const gradientId = `trail-${useId().replace(/[^\w-]/g, "")}`;

  const placed = useMemo(() => placeMarkers(events, durationMs), [events, durationMs]);

  const pct = (ms: number) => (durationMs > 0 ? Math.min(100, Math.max(0, (ms / durationMs) * 100)) : 0);
  const minuteTicks = Array.from({ length: Math.max(0, Math.floor((durationMs - 1) / 60000)) }, (_, i) => (i + 1) * 60000);
  const ready = status === "ready";

  return (
    <section
      aria-labelledby="timeline-heading"
      className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-chrome px-4 pt-4 pb-3.5 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="timeline-heading" className="font-display text-lg leading-tight font-bold text-ink">
            Your learning trail
          </h2>
          {ready && events.length > 0 ? (
            <p data-testid="timeline-hint" className="text-[13px] text-ink-subtle">
              Tap a marker to jump to it
            </p>
          ) : null}
        </div>
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
          {MOMENT_ORDER.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <MomentGlyph type={t} size={12} />
              {MOMENT_META[t].legend}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-subtle">{formatClock(0)}</span>
        <div
          data-testid="timeline"
          data-status={status}
          data-event-count={events.length}
          className="relative min-h-[72px] min-w-0 flex-1 rounded-[14px] border border-line bg-chrome-hover"
        >
          {/* "Your normal pace": the first two minutes of the student's own writing calibrate "your normal", so
              nothing is flagged there. It follows the student (mid-lecture starts, jumps ahead). The label
              stays on one line and may run past a narrow zone, so a zone in the right half anchors it to
              its right edge to keep it inside the track. */}
          {baseline.map((zone, i) => (
            <div
              key={zone.startMs}
              aria-hidden="true"
              data-testid="timeline-baseline"
              data-start-ms={zone.startMs}
              data-end-ms={zone.endMs}
              className={`absolute inset-y-0 border-dashed border-line-strong/70 ${
                zone.startMs <= 0 ? "rounded-l-[13px] border-r" : "border-x"
              }`}
              style={{
                left: `${pct(zone.startMs)}%`,
                width: `${pct(zone.endMs) - pct(zone.startMs)}%`,
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 6px, rgb(22 19 43 / 0.06) 6px 7px)",
              }}
            >
              {/* The label gives way to the empty-trail note, which would sit on top of it on phones. */}
              {i === 0 && !(ready && events.length === 0) ? (
                <span
                  className={`absolute top-1.5 text-[10px] leading-none font-extrabold tracking-[0.1em] whitespace-nowrap text-ink-subtle uppercase ${
                    pct(zone.startMs) > 50 ? "right-2.5" : "left-2.5"
                  }`}
                >
                  Your normal pace
                </span>
              ) : null}
            </div>
          ))}

          {minuteTicks.map((ms) => (
            <span
              key={ms}
              aria-hidden="true"
              className="absolute bottom-0 h-1.5 w-px bg-line-strong"
              style={{ left: `${(ms / durationMs) * 100}%` }}
            />
          ))}

          {ready && spark ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 1000 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible rounded-[13px]"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopOpacity="0.45" style={{ stopColor: "var(--color-accent-light)" }} />
                  <stop offset="1" stopOpacity="0.04" style={{ stopColor: "var(--color-accent-light)" }} />
                </linearGradient>
              </defs>
              <path
                d={spark}
                fill={`url(#${gradientId})`}
                className="stroke-[#6f63f2]"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}

          {status === "analyzing" ? (
            <p
              role="status"
              data-testid="timeline-analyzing"
              className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-ink-muted"
            >
              <span aria-hidden="true" className="size-2 animate-pulse rounded-pill bg-accent" />
              Thinking hard… reading your notes
            </p>
          ) : null}

          {status === "error" ? (
            <div role="alert" className="absolute inset-0 flex items-center justify-center gap-2 px-3 text-sm text-danger">
              Couldn’t read this session.
              <button
                type="button"
                onClick={onRetry}
                className="press inline-flex min-h-11 items-center rounded-md px-3 font-bold text-accent hover:bg-accent-soft"
              >
                Try again
              </button>
            </div>
          ) : null}

          {/* In the flow (not laid over the track), so a long note on a phone makes the track taller
              instead of spilling out of it. */}
          {ready && events.length === 0 ? (
            <p
              data-testid="timeline-empty"
              data-reason={littleInk ? "little-ink" : "steady"}
              className="relative flex min-h-[70px] items-center justify-center px-3 py-2"
            >
              <span className="rounded-[12px] bg-chrome/90 px-3 py-1 text-center text-sm text-pretty text-ink-muted">
                {littleInk
                  ? "Not enough writing to spot anything yet — write along for a few minutes while the lecture plays, then finish again."
                  : "Nothing flagged — your notes flowed steadily all the way through."}
              </span>
            </p>
          ) : null}

          {ready && placed.length > 0 ? (
            <ol aria-label="Moments" className="absolute inset-0">
              {placed.map(({ e, pct, lane }) => {
                const selected = e.id === selectedId;
                return (
                  <li key={e.id} className="absolute inset-y-0" style={{ left: `${pct}%` }}>
                    {selected ? (
                      <span
                        aria-hidden="true"
                        className={`absolute -inset-y-1 left-0 w-0.5 -translate-x-1/2 rounded-pill opacity-70 ${GUIDE_CLASS[e.type]}`}
                      />
                    ) : null}
                    <button
                      type="button"
                      data-testid="timeline-marker"
                      data-type={e.type}
                      data-status={e.status}
                      data-event-id={e.id}
                      aria-label={momentAriaLabel(e)}
                      aria-pressed={selected}
                      title={`${MOMENT_META[e.type].label} · ${formatClock(e.lectureMs)}`}
                      onClick={() => onSelect(selected ? null : e.id)}
                      className="group absolute top-1/2 left-0 inline-flex size-11 -translate-x-1/2 items-center justify-center rounded-pill"
                      style={{ marginTop: lane === 1 ? -30 : -22 }}
                    >
                      {/* Selected: a white disc with an ink ring, lifted. */}
                      <span
                        className={`inline-flex items-center justify-center rounded-pill transition-transform duration-150 ease-out group-hover:scale-110 group-active:scale-95 ${
                          selected
                            ? "size-9 border-2 border-ink bg-chrome shadow-[0_6px_16px_-6px_rgb(22_19_43/0.4)]"
                            : "size-7"
                        }`}
                      >
                        <MomentGlyph type={e.type} size={selected ? 16 : 18} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
        <span className="shrink-0 text-right font-mono text-xs tabular-nums text-ink-subtle">{formatClock(durationMs)}</span>
      </div>
    </section>
  );
}
