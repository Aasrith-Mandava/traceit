"use client";

// The class insights heatmap: lecture time left → right in 30 s columns, two rows — "students who
// hesitated or erased" (k-anonymous: fewer than 3 is never shown) and "erased strokes" (the hotspots
// query; on Tiger Data a TimescaleDB continuous aggregate). One sequential hue (ink indigo), lighter =
// less, relative to each row's busiest column; "none" is an empty dashed cell, outside the ramp.
// Hand-rolled SVG sized to its container, a per-column tooltip on hover and on keyboard focus
// (arrow keys), and a table view.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ClassBucket, ReteachMoment } from "@/lib/teacher";
import { formatClock } from "@/lib/time";

/**
 * Sequential ink-indigo ramp (the brand), light → dark: indigo soft, lighter, light, indigo, indigo
 * hover, ink. The four darkest steps are ≥ 3:1 against the white card (3.2, 7.1, 9.4 and 18:1).
 */
const RAMP = ["#eceafe", "#b9b2f5", "#8b80f9", "#4b3bdb", "#3a2cb8", "#16132b"] as const;
/** "None / fewer than 3 students": a blank cell with a dashed outline, clearly not part of the ramp. */
const EMPTY = "#ffffff";
const EMPTY_STROKE = "var(--color-line-strong)";

export const rampColor = (level: number) => (level <= 0 ? EMPTY : RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length - 1e-9))]);

const ROW_H = 30;
const ROW_GAP = 22; // room for the second row's label
const LABEL_H = 18;
const AXIS_H = 20;
const MARK_H = 18;
const GAP = 2;

const range = (b: { startMs: number; endMs: number }) => `${formatClock(b.startMs)}–${formatClock(b.endMs)}`;

function tickStep(durationMs: number, width: number): number {
  const maxTicks = Math.max(2, Math.floor(width / 70));
  for (const step of [30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000]) {
    if (durationMs / step <= maxTicks) return step;
  }
  return 3_600_000;
}

/** One heatmap cell: a ramp step, or a blank dashed cell for "none / fewer than 3". */
function Cell({ x, y, w, level }: { x: number; y: number; w: number; level: number }) {
  const rx = Math.min(4, w / 3);
  return level <= 0 ? (
    <rect
      x={x + 0.5}
      y={y + 0.5}
      width={Math.max(0, w - 1)}
      height={ROW_H - 1}
      rx={rx}
      fill={EMPTY}
      stroke={EMPTY_STROKE}
      strokeWidth={1}
      strokeDasharray="3 2"
    />
  ) : (
    <rect x={x} y={y} width={w} height={ROW_H} rx={rx} fill={rampColor(level)} />
  );
}

export default function TeacherHeatmap({
  buckets,
  moments,
  source,
  timescale,
  onPlayFrom,
}: {
  buckets: ClassBucket[];
  moments: ReteachMoment[];
  source: string;
  timescale: boolean;
  /** Plays the lecture from a column's start (click / Enter). */
  onPlayFrom?: (startMs: number, endMs: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const tipId = useId();
  const titleId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(1, buckets.length);
  const step = width / n;
  const endMs = buckets.length ? buckets[buckets.length - 1].endMs : 0;
  // Columns are equal width; the grid's time scale is the (full) first bucket's length.
  const bucketLen = buckets.length ? buckets[0].endMs - buckets[0].startMs : 30_000;
  const xAt = (ms: number) => Math.min(width, (ms / Math.max(1, bucketLen)) * step);
  const rowY = [MARK_H + LABEL_H, MARK_H + LABEL_H + ROW_H + ROW_GAP];
  const height = rowY[1] + ROW_H + AXIS_H;
  const tick = tickStep(endMs, width);
  const ticks: number[] = [];
  for (let t = 0; t <= endMs; t += tick) ticks.push(t);

  const peak = buckets.reduce((m, b) => Math.max(m, b.erased), 0);
  const shown = active !== null ? buckets[active] : null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = buckets.length - 1;
    const cur = active ?? 0;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(last, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if ((e.key === "Enter" || e.key === " ") && shown && onPlayFrom) {
      e.preventDefault();
      onPlayFrom(shown.startMs, shown.endMs);
      return;
    } else if (e.key === "Escape") {
      setActive(null);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    setActive(next);
  };

  const tipLeft = active !== null ? Math.min(Math.max((active + 0.5) * step, 110), Math.max(110, width - 110)) : 0;

  return (
    <figure
      data-testid="teacher-heatmap"
      data-columns={buckets.length}
      data-timescale={timescale ? "true" : "false"}
      aria-labelledby={titleId}
      className="panel flex flex-col gap-4 px-4 pt-5 pb-4 sm:px-[22px]"
    >
      <figcaption className="flex flex-col gap-1">
        <span id={titleId} className="font-display text-lg leading-tight font-bold tracking-[-0.01em] text-ink">
          When the whole room slowed down
        </span>
        <span className="text-[13px] text-pretty text-ink-subtle">
          The class heatmap: each column is 30 seconds of the lecture. Darker = more of the class, relative to the busiest
          moment.
          {onPlayFrom ? " Click a column to hear it." : null}
        </span>
      </figcaption>

      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label="Class heatmap. Use the left and right arrow keys to move through the lecture; Enter plays the selected 30 seconds."
        aria-describedby={shown ? tipId : undefined}
        onKeyDown={onKeyDown}
        onFocus={() => {
          setFocused(true);
          setActive((a) => a ?? 0);
        }}
        onBlur={() => {
          setFocused(false);
          setActive(null);
        }}
        onPointerLeave={() => {
          if (!focused) setActive(null);
        }}
        className="relative rounded-md outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block max-w-full select-none">
          {/* Numbered markers above the stretches to re-teach (direct labels for the list below). */}
          {moments.map((m) => {
            const x0 = xAt(m.startMs);
            const x1 = m.endMs >= endMs ? width : xAt(m.endMs);
            const cx = (x0 + x1) / 2;
            return (
              <g key={m.rank} data-testid="heatmap-moment-marker">
                <line x1={x0 + GAP} x2={x1 - GAP} y1={MARK_H - 2} y2={MARK_H - 2} stroke="var(--color-night)" strokeWidth={2} strokeLinecap="round" />
                <circle cx={cx} cy={MARK_H - 11} r={7.5} fill="var(--color-night)" />
                <text x={cx} y={MARK_H - 7.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--color-highlight)">
                  {m.rank}
                </text>
              </g>
            );
          })}

          <text x={0} y={rowY[0] - 6} fontSize={11.5} fontWeight={700} fill="var(--color-ink-muted)">
            Students who hesitated or erased
          </text>
          <text x={0} y={rowY[1] - 6} fontSize={11.5} fontWeight={700} fill="var(--color-ink-muted)">
            Erased strokes
          </text>

          {buckets.map((b, i) => {
            const x = i * step + GAP / 2;
            const w = Math.max(1, step - GAP);
            const isActive = i === active;
            return (
              <g key={b.startMs} data-testid="heatmap-column" data-start-ms={b.startMs} data-students={b.students ?? ""} data-erased={b.erased}>
                <Cell x={x} y={rowY[0]} w={w} level={b.studentLevel} />
                <Cell x={x} y={rowY[1]} w={w} level={b.erasedLevel} />
                {isActive ? (
                  <>
                    {/* White halo under the ink outline so it reads against the darkest cells too. */}
                    <rect
                      x={x - 1}
                      y={rowY[0] - 1}
                      width={w + 2}
                      height={rowY[1] + ROW_H - rowY[0] + 2}
                      rx={6}
                      fill="none"
                      stroke="var(--color-chrome)"
                      strokeWidth={3.5}
                    />
                    <rect
                      x={x - 1}
                      y={rowY[0] - 1}
                      width={w + 2}
                      height={rowY[1] + ROW_H - rowY[0] + 2}
                      rx={6}
                      fill="none"
                      stroke="var(--color-ink)"
                      strokeWidth={1.5}
                    />
                  </>
                ) : null}
                {/* Hit target: the whole column, gaps included. */}
                <rect
                  x={i * step}
                  y={rowY[0] - LABEL_H}
                  width={step}
                  height={rowY[1] + ROW_H - rowY[0] + LABEL_H}
                  fill="transparent"
                  className={onPlayFrom ? "cursor-pointer" : undefined}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => onPlayFrom?.(b.startMs, b.endMs)}
                />
              </g>
            );
          })}

          {ticks.map((t) => {
            const x = Math.min(width - 1, xAt(t));
            const anchor = t === 0 ? "start" : x > width - 24 ? "end" : "middle";
            return (
              <g key={t}>
                <line x1={x} x2={x} y1={rowY[1] + ROW_H + 2} y2={rowY[1] + ROW_H + 6} stroke="var(--color-line-strong)" />
                <text
                  x={x}
                  y={height - 3}
                  textAnchor={anchor}
                  fontSize={11}
                  fill="var(--color-ink-subtle)"
                  className="font-mono"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatClock(t)}
                </text>
              </g>
            );
          })}
        </svg>

        {shown ? (
          <div
            id={tipId}
            role="status"
            data-testid="heatmap-tooltip"
            className="pointer-events-none absolute top-full z-10 mt-1.5 flex w-max max-w-[230px] -translate-x-1/2 flex-col gap-0.5 rounded-[12px] border border-line bg-chrome px-3 py-2 text-xs shadow-lift"
            style={{ left: tipLeft }}
          >
            <span className="block font-mono text-[11px] text-ink-subtle tabular-nums">{range(shown)}</span>
            <span className="block font-semibold text-ink tabular-nums">
              {shown.students === null ? "Fewer than 3 students" : `${shown.students} students`}
              <span className="font-normal text-ink-muted"> hesitated or erased</span>
            </span>
            <span className="block text-ink-muted tabular-nums">
              {shown.erased} of {shown.strokes} strokes erased
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-ink-subtle">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-[3px] border border-dashed border-line-strong" style={{ background: EMPTY }} />
            none or fewer than 3
          </span>
          <span className="inline-flex items-center gap-1">
            less
            <span className="inline-flex gap-0.5">
              {RAMP.map((c) => (
                <span key={c} className="inline-block h-3 w-3.5 rounded-[3px]" style={{ background: c }} />
              ))}
            </span>
            more
          </span>
        </span>
        <span data-testid="teacher-source" data-timescale={timescale ? "true" : "false"} className="text-pretty">
          Erased strokes: <span className="font-medium text-ink-muted">{source}</span>
          {peak > 0 ? <span className="tabular-nums"> · busiest 30 s: {peak}</span> : null}
        </span>
      </div>

      <details className="group text-sm">
        <summary className="press -mx-3 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-3 font-bold text-accent hover:bg-accent-soft hover:text-accent-press">
          Show as a table
        </summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-line">
          <table data-testid="heatmap-table" className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Class activity per 30 seconds of the lecture</caption>
            <thead className="sticky top-0 bg-chrome-hover text-xs text-ink-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-bold">Lecture time</th>
                <th scope="col" className="px-3 py-2 font-bold">Students who hesitated or erased</th>
                <th scope="col" className="px-3 py-2 font-bold">Erased strokes</th>
                <th scope="col" className="px-3 py-2 font-bold">All strokes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {buckets.map((b) => (
                <tr key={b.startMs}>
                  <td className="px-3 py-1.5 font-mono text-xs">{range(b)}</td>
                  <td className="px-3 py-1.5">{b.students === null ? "fewer than 3" : b.students}</td>
                  <td className="px-3 py-1.5">{b.erased}</td>
                  <td className="px-3 py-1.5">{b.strokes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
