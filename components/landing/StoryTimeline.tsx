"use client";

// "How it works", step by step: four steps beside a learning trail. The trail fills once when the
// section scrolls into view, with the session's moments (Aha moment ◆, Fixed ●, Still fuzzy ○)
// popping in at their lecture seconds. It never hijacks scrolling: a step only expands when it is
// clicked. Reduced motion: the finished trail, statically.

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { HeroInk } from "./HeroInk";
import { APP_URL } from "./site";
import { PenIcon, SignalIcon, SparkIcon, GhostInkIcon } from "./icons";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";

const LECTURE_MS = 360_000;

const STEPS = [
  {
    title: "Write along",
    body: "Take notes while the lecture plays. Every pen stroke is stamped with the second it belongs to, and nothing you erase is lost.",
    Icon: PenIcon,
  },
  {
    title: "Spot the slow-downs",
    body: "Slower writing, extra erasing and going quiet while the lecturer keeps talking are measured against your own pace, not a class average.",
    Icon: SignalIcon,
  },
  {
    title: "Pair the do-overs",
    body: "Each erase is paired with the rewrite that replaced it, so a mistake you fixed shows up as Fixed instead of vanishing.",
    Icon: GhostInkIcon,
  },
  {
    title: "Explain it again",
    body: "For every moment: a short explanation of what the lecturer said at that second and a quick self-test, in your language.",
    Icon: SparkIcon,
  },
] as const;

type Kind = "breakthrough" | "corrected" | "gap";
const MOMENTS: { ms: number; kind: Kind; label: string; caption: string }[] = [
  { ms: 62_000, kind: "breakthrough", label: "Aha moment", caption: "Outer derivative fixed, then proved on the self-test" },
  { ms: 100_000, kind: "corrected", label: "Fixed", caption: "cos(x²) → 2x·cos(x²): forgot the inner derivative" },
  { ms: 250_000, kind: "gap", label: "Still fuzzy", caption: "Product vs chain rule: slowed down, erased, never cleared" },
];

// Shape + colour per moment (literal classes for Tailwind): Aha ◆ pink diamond, Fixed ● green dot,
// Still fuzzy ○ orange ring.
const KIND_STYLE: Record<Kind, { dot: string; chip: string }> = {
  breakthrough: {
    dot: "size-3.5 rotate-45 rounded-[3px] bg-breakthrough ring-4 ring-breakthrough/15",
    chip: "border-breakthrough/30 bg-breakthrough-soft text-breakthrough-strong",
  },
  corrected: {
    dot: "size-3.5 rounded-full bg-corrected ring-4 ring-corrected/15",
    chip: "border-corrected/30 bg-corrected-soft text-corrected-strong",
  },
  gap: {
    dot: "size-3.5 rounded-full border-[3px] border-gap bg-white ring-4 ring-gap/15",
    chip: "border-gap/30 bg-gap-soft text-gap-strong",
  },
};

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Seconds for the timeline to fill once the section is in view. */
const FILL_SECONDS = 2.8;

function Marker({ m, fill, reduce }: { m: (typeof MOMENTS)[number]; fill: MotionValue<number>; reduce: boolean }) {
  const pos = m.ms / LECTURE_MS;
  const scale = useTransform(fill, [pos - 0.01, pos + 0.025], [0, 1], { clamp: true });
  const opacity = useTransform(fill, [pos - 0.01, pos + 0.02], [0, 1], { clamp: true });
  const style = KIND_STYLE[m.kind];
  return (
    <motion.li
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${pos * 100}%` }}
      data-moment={m.kind}
    >
      <motion.span
        className={`block ${style.dot}`}
        style={reduce ? undefined : { scale, opacity }}
        aria-hidden="true"
      />
      <span className="sr-only">
        {clock(m.ms)} {m.label}: {m.caption}
      </span>
    </motion.li>
  );
}

function MomentCard({ m, fill, reduce }: { m: (typeof MOMENTS)[number]; fill: MotionValue<number>; reduce: boolean }) {
  const pos = m.ms / LECTURE_MS;
  const opacity = useTransform(fill, [pos, pos + 0.04], [0, 1], { clamp: true });
  const y = useTransform(fill, [pos, pos + 0.05], [10, 0], { clamp: true });
  const style = KIND_STYLE[m.kind];
  return (
    <motion.li
      aria-hidden="true"
      className="flex items-start gap-3 rounded-md border border-line bg-chrome-hover px-3 py-2.5"
      style={reduce ? undefined : { opacity, y }}
    >
      <span className="mt-0.5 font-mono text-[12px] text-ink-subtle tabular-nums">{clock(m.ms)}</span>
      <span className={`shrink-0 rounded-pill border px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${style.chip}`}>
        {m.label}
      </span>
      <span className="min-w-0 text-[13.5px] leading-snug text-pretty text-ink-muted">{m.caption}</span>
    </motion.li>
  );
}

/** Mini illustration per step (decorative). */
function StepArt({ step }: { step: number }) {
  const common = { width: 148, height: 44, viewBox: "0 0 148 44", fill: "none", "aria-hidden": true as const, className: "shrink-0" };
  if (step === 0)
    return (
      <svg {...common}>
        <path d="M6 28c6-10 10-10 13 0s7 8 11-2 8-9 11 1" stroke="#1d1a3a" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" y1="38" x2="144" y2="38" stroke="#dce3f2" strokeWidth="2" strokeLinecap="round" />
        <circle cx="30" cy="38" r="3.5" fill="#4b3bdb" />
        <rect x="58" y="10" width="44" height="18" rx="9" fill="#eceafe" stroke="#b9b2f5" />
        <text x="80" y="23" textAnchor="middle" fontSize="10" fontFamily="ui-monospace, monospace" fill="#3a2cb8">00:18</text>
      </svg>
    );
  if (step === 1)
    return (
      <svg {...common}>
        <rect x="4" y="18" width="140" height="12" rx="3" fill="#eceafe" />
        <path d="M4 26h18l6-4 6 5 8-3 8 3 8-2 6 2 6-18 6 20 8-3 10 2 12-1 10 1h26" stroke="#1d1a3a" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="94" cy="8" r="3.5" fill="#fff" stroke="#f08c00" strokeWidth="2.5" />
      </svg>
    );
  if (step === 2)
    return (
      <svg {...common}>
        <path d="M6 26c5-9 9-9 12 0M22 18l8 14M30 18l-8 14" stroke="#8b80f9" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
        <path d="M52 24h26m-6-5 6 5-6 5" stroke="#c9c5e0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M94 26c5-9 9-9 12 0M110 18l8 14M118 18l-8 14M124 30c2-4 6-4 8 0" stroke="#1d1a3a" strokeWidth="2" strokeLinecap="round" />
        <rect x="88" y="10" width="54" height="28" rx="7" fill="#e3f7ee" fillOpacity=".6" stroke="#0e9f6e" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="4" y="4" width="80" height="22" rx="8" fill="#fff" stroke="#e4e2f0" />
      <path d="M12 12h56M12 18h40" stroke="#c9c5e0" strokeWidth="2" strokeLinecap="round" />
      {[0, 1, 2, 3].map((k) => (
        <rect key={k} x={4 + k * 36} y="32" width="30" height="10" rx="5" fill={k === 1 ? "#d9f99d" : "#fff"} stroke={k === 1 ? "#c2ea7a" : "#e4e2f0"} />
      ))}
    </svg>
  );
}

function Stage({
  fill,
  open,
  reduce,
  onToggle,
  demoHref,
}: {
  fill: MotionValue<number>;
  open: number | null;
  reduce: boolean;
  onToggle: (i: number) => void;
  demoHref: string;
}) {
  const playhead = useTransform(fill, (v) => `${v * 100}%`);
  return (
    <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      {/* Steps */}
      <ol className="relative grid gap-1 pl-6 lg:gap-2">
        <span aria-hidden="true" className="absolute top-2 bottom-2 left-[5px] w-px bg-line-strong" />
        <motion.span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[5px] w-[2px] -translate-x-[0.5px] origin-top bg-accent"
          style={reduce ? undefined : { scaleY: fill }}
        />
        {STEPS.map(({ title, body, Icon }, i) => {
          const current = i === open;
          const detailId = `how-step-${i}-detail`;
          return (
            <li key={title} className="relative">
              <span
                aria-hidden="true"
                className={`absolute top-[1.35rem] -left-[1.4rem] size-[11px] rounded-full border-2 transition-colors duration-300 ${
                  current ? "border-accent bg-highlight" : "border-accent bg-white"
                }`}
              />
              <div
                className={`rounded-lg transition-[opacity,background-color,box-shadow] duration-300 ${
                  current ? "bg-white shadow-card ring-1 ring-line" : "hover:bg-white/70"
                }`}
              >
                <button
                  type="button"
                  aria-expanded={current}
                  aria-controls={detailId}
                  onClick={() => onToggle(i)}
                  className="block w-full cursor-pointer rounded-lg px-4 py-3 text-left max-lg:py-2.5"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={18} className={current ? "text-accent-strong" : "text-ink-subtle"} />
                    <span className="text-lg font-bold tracking-tight text-ink">
                      <span className="mr-2 font-mono text-[12px] font-medium text-accent-strong">0{i + 1}</span>
                      {title}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[15px] leading-relaxed text-pretty text-ink-muted">
                    {body}
                  </span>
                </button>
                <div id={detailId} hidden={!current} className="px-4 pb-3.5">
                  {current && (
                    <motion.div
                      className="flex items-center justify-between gap-3"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <StepArt step={i} />
                      <a
                        href={demoHref}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-[14px] font-bold text-accent-strong hover:text-ink"
                      >
                        See it in the demo <span aria-hidden="true">→</span>
                      </a>
                    </motion.div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Visual: the ghost-ink card + the learning trail */}
      <div className="grid gap-4">
        <div className="hidden md:block">
          <HeroInk />
        </div>
        <div className="card p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-ink-muted">
              <span className="font-bold text-ink">Your learning trail</span>
              <span className="max-sm:hidden">
                <span aria-hidden="true"> · </span>Calculus I, the chain rule
              </span>
            </p>
            <p className="font-mono text-[12px] whitespace-nowrap text-ink-subtle tabular-nums">00:00–06:00</p>
          </div>
          {/* The playhead is translated up to 100% of the track: clip it horizontally (with a little room). */}
          <div className="-mx-2 overflow-x-clip px-2">
          <div className="relative mt-5 mb-2 h-6">
            <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-1.5 origin-left -translate-y-1/2 rounded-full bg-accent-light"
              style={reduce ? undefined : { scaleX: fill }}
            />
            {!reduce && (
              <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ x: playhead }}>
                <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_0_0_3px_rgb(255_255_255/0.9)]" />
              </motion.div>
            )}
            <ul aria-label="Moments on your learning trail" className="absolute inset-0">
              {MOMENTS.map((m) => (
                <Marker key={m.kind} m={m} fill={fill} reduce={reduce} />
              ))}
            </ul>
          </div>
          </div>
          <ul className="mt-4 grid gap-2">
            {MOMENTS.map((m) => (
              <MomentCard key={m.kind} m={m} fill={fill} reduce={reduce} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** `demoHref`: where "See it in the demo" goes — the seeded demo review in DEMO_MODE, else the app. */
export function StoryTimeline({ demoHref = APP_URL }: { demoHref?: string }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const fill = useMotionValue(0);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (reduce) {
      fill.set(1);
      return;
    }
    if (!inView) return;
    const controls = animate(fill, 1, { duration: FILL_SECONDS, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [fill, inView, reduce]);

  return (
    <div ref={ref} className="py-4" data-story={reduce ? "static" : "animated"}>
      <Stage
        fill={fill}
        open={open}
        reduce={reduce}
        onToggle={(i) => setOpen((o) => (o === i ? null : i))}
        demoHref={demoHref}
      />
    </div>
  );
}
