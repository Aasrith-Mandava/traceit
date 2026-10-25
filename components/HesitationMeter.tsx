"use client";

import { useEffect, useMemo, useState } from "react";
import { liveHesitation, type MeterState } from "@/lib/liveHesitation";
import type { Stroke, TranscriptWord } from "@/lib/types";

/** How often the meter re-reads the lecture clock (a silence grows without new ink). */
const TICK_MS = 2000;
const BARS = 5;

const LABEL: Record<MeterState, string> = {
  calibrating: "Learning your pace",
  steady: "Steady",
  slowing: "Slowing down",
  stuck: "Thinking hard…",
};

// Literal class names so Tailwind generates them. The chip sits in the dark lecture band: quiet
// while writing flows, warm orange once the student slows down or stalls.
const BAR_ON: Record<MeterState, string> = {
  calibrating: "bg-white/30",
  steady: "bg-accent-light",
  slowing: "bg-amber-300",
  stuck: "bg-[#ffc266]",
};
const CHIP: Record<MeterState, string> = {
  calibrating: "bg-white/5 text-night-text",
  steady: "bg-white/5 text-night-text",
  slowing: "bg-gap/10 text-amber-200",
  stuck: "bg-gap/16 text-[#ffc266]",
};

/**
 * A small, calm read-out of how the last ~20 s of writing compares with the student's own normal
 * (lib/liveHesitation), shown as a chip in the lecture band. Recomputed when the ink changes (a
 * finished stroke, an erase) and every 2 s — never per pointer move; only this small component
 * re-renders, so drawing stays smooth.
 */
export default function HesitationMeter({
  strokes,
  words,
  getLectureMs,
}: {
  strokes: Stroke[];
  words: TranscriptWord[];
  getLectureMs: () => number;
}) {
  // The lecture clock, sampled on a slow timer (a paused lecture keeps the same value: no re-render).
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(getLectureMs()), TICK_MS);
    return () => clearInterval(timer);
  }, [getLectureMs]);

  const { state, level, reasons } = useMemo(() => liveHesitation({ strokes, words, nowMs }), [strokes, words, nowMs]);
  const lit = state === "calibrating" ? 0 : Math.max(1, Math.ceil(level * BARS));
  const detail = reasons.length ? reasons.join("; ") : state === "calibrating" ? "Keep writing — it compares you with your own pace." : "Writing at your usual pace.";

  return (
    <div
      data-testid="hesitation-meter"
      data-state={state}
      data-level={level}
      role="meter"
      aria-label="Hesitation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-valuetext={`${LABEL[state]} — ${detail}`}
      title={detail}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-pill px-3 text-sm font-bold motion-safe:transition-colors motion-safe:duration-300 ${CHIP[state]}`}
    >
      <span aria-hidden="true" className="flex h-3.5 items-end gap-[3px]">
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            style={{ height: `${5 + i * 2}px` }}
            className={`w-[3px] rounded-pill motion-safe:transition-colors motion-safe:duration-300 ${
              i < lit ? BAR_ON[state] : "bg-white/15"
            }`}
          />
        ))}
      </span>
      <span className="hidden whitespace-nowrap md:inline">{LABEL[state]}</span>
    </div>
  );
}
