"use client";

// "What's inside": the six tool cards (white, hairline border, a tinted icon chip; the last one is
// lime) open (click, Enter or Space) into a detail sheet with a shared-element (layoutId)
// expansion — focus trapped, Escape closes, focus returns to the card. Below them, a "See the
// details" strip (how detection is checked) and a "help in your language" band whose chips are a radio
// group: pick a language to read the same sample explanation in it (auto-cycling stops once you
// pick). Reduced motion gets instant, static states.

import { useCallback, useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { AnimatePresence, LayoutGroup, motion, useInView } from "motion/react";
import { LANGUAGES } from "@/lib/landing/languages";
import { motionTokens, springs } from "@/lib/motion";
import { RadioGroup } from "./RadioGroup";
import { Stagger, StaggerItem } from "./Reveal";
import { APP_URL } from "./site";
import { useDialog } from "./useDialog";
import { usePrefersReducedMotion } from "../motion/usePrefersReducedMotion";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BarsIcon,
  CloseIcon,
  FlaskIcon,
  GhostPenIcon,
  PulseIcon,
  QuestionIcon,
  SpeakerIcon,
  SplitIcon,
} from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface Feature {
  id: string;
  title: string;
  body: string;
  detail: string;
  icon: Icon;
  /** Icon chip (tint + icon colour) and card surface — literal classes for Tailwind. */
  chip: string;
  card: string;
  bodyText: string;
}

const PLAIN_CARD = "border-line bg-white";
const PLAIN_TEXT = "text-ink-muted";

const FEATURES: Feature[] = [
  {
    id: "ghost",
    title: "Ghost ink",
    body: "Erase as much as you like. The old attempt fades to a faint outline you can show or hide whenever you want.",
    detail:
      "Nothing you erase is deleted. In study mode, flip on Show erased ink to see every earlier attempt under the final answer as faded, dashed ink. Each erase is paired with the rewrite that replaced it, so you can see exactly what changed.",
    icon: GhostPenIcon,
    chip: "bg-accent-soft text-accent",
    card: PLAIN_CARD,
    bodyText: PLAIN_TEXT,
  },
  {
    id: "timeline",
    title: "Learning trail",
    body: "One strip shows the whole lecture, marked with every fix, fuzzy spot and breakthrough. Tap any marker to jump right there.",
    detail:
      "After a session, its moments line up on the lecture's own clock: Fixed, Still fuzzy and Aha moment, each pinned to its second. Hear the 20 seconds of lecture around any of them. Anything still fuzzy carries into your next session until you clear it.",
    icon: PulseIcon,
    chip: "bg-ok-soft text-ok-strong",
    card: PLAIN_CARD,
    bodyText: PLAIN_TEXT,
  },
  {
    id: "selftest",
    title: "Self-tests from your slips",
    body: "Each mistake comes with a short explanation and a multiple-choice question built around it, so you can check that it actually stuck.",
    detail:
      "For every moment, TraceIt reads what you changed (the before and after of your handwriting) and what the lecturer was saying at that second, then writes an explanation of about 80 words and one multiple-choice question. Your answer is checked on the server: get it right and the fix becomes an Aha moment.",
    icon: QuestionIcon,
    chip: "bg-breakthrough-soft text-breakthrough-strong",
    card: PLAIN_CARD,
    bodyText: PLAIN_TEXT,
  },
  {
    id: "listen",
    title: "Hear it again",
    body: "Replay the exact stretch of lecture you were writing through, read the captions, or have a recap read out loud.",
    detail:
      "Replay the stretch of lecture around any moment and follow along in the captions. Explanations, self-tests and the spoken session recap come in 10 languages (English, Spanish, Hindi, Mandarin, Arabic, French, Telugu, Korean, Vietnamese and Brazilian Portuguese), and any of them can be read aloud, with an ElevenLabs voice or your browser's own.",
    icon: SpeakerIcon,
    chip: "bg-gap-soft text-gap-strong",
    card: PLAIN_CARD,
    bodyText: PLAIN_TEXT,
  },
  {
    id: "notability",
    title: "Plays nice with Notability",
    body: "Lay your Notability page next to TraceIt’s version to see what it left out, then export a PDF that brings your process along.",
    detail:
      "Bring in the PDF export of the same notes and see it side by side with TraceIt's version, or with an overlay slider, plus a count of what the final page hides. Then send the session back to Notability as a PDF with your ghosts and labelled moments.",
    icon: SplitIcon,
    chip: "bg-desk text-ink",
    card: PLAIN_CARD,
    bodyText: PLAIN_TEXT,
  },
  {
    id: "growth",
    title: "Progress you can see",
    body: "Fuzzy spots carry over between sessions and clear once you handle them with ease, so you can watch the list shrink.",
    detail:
      "Anything still fuzzy follows you into your next session and waits there until you handle it with ease. The My progress page keeps count of what you've cleared and what's left, so you can watch the list of fuzzy spots get shorter lecture by lecture.",
    icon: BarsIcon,
    chip: "bg-ink text-highlight",
    card: "border-highlight-strong bg-highlight",
    bodyText: "text-[#2e3a12]",
  },
];

/* ───────── small visuals for the detail sheet (decorative) ───────── */

function FeatureArt({ id }: { id: string }) {
  const svg = { width: 240, height: 72, viewBox: "0 0 240 72", fill: "none", "aria-hidden": true as const };
  switch (id) {
    case "ghost":
      return (
        <svg {...svg}>
          <path d="M20 46c8-18 16-18 22 0M48 30l14 24M62 30 48 54" stroke="#8b80f9" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
          <path d="M96 42h40m-8-7 8 7-8 7" stroke="#c9c5e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M160 46c8-18 16-18 22 0M188 30l14 24M202 30l-14 24M208 52c3-6 9-6 12 0" stroke="#1d1a3a" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "timeline":
      return (
        <svg {...svg}>
          <rect x="10" y="33" width="220" height="6" rx="3" fill="#e4e2f0" />
          <rect x="10" y="33" width="150" height="6" rx="3" fill="#8b80f9" />
          <rect x="42" y="30" width="12" height="12" rx="2" transform="rotate(45 48 36)" fill="#e0338a" />
          <circle cx="78" cy="36" r="7" fill="#0e9f6e" />
          <circle cx="176" cy="36" r="5.5" fill="#fff" stroke="#f08c00" strokeWidth="3" />
        </svg>
      );
    case "selftest":
      return (
        <svg {...svg}>
          <rect x="20" y="6" width="200" height="16" rx="5" fill="#fff" stroke="#e4e2f0" />
          <path d="M30 14h120" stroke="#c9c5e0" strokeWidth="2" strokeLinecap="round" />
          {[0, 1, 2].map((k) => (
            <g key={k}>
              <rect x={20 + k * 68} y="34" width="60" height="26" rx="13" fill={k === 1 ? "#d9f99d" : "#fff"} stroke={k === 1 ? "#c2ea7a" : "#e4e2f0"} />
              <path d={`M${36 + k * 68} 47h28`} stroke={k === 1 ? "#16132b" : "#c9c5e0"} strokeWidth="2" strokeLinecap="round" />
            </g>
          ))}
        </svg>
      );
    case "listen":
      return (
        <svg {...svg}>
          {[6, 12, 20, 9, 26, 14, 30, 18, 10, 24, 16, 8, 22, 12, 6, 14, 20, 10].map((h, i) => (
            <rect key={i} x={30 + i * 10} y={36 - h / 2} width="5" height={h} rx="2.5" fill={i >= 5 && i <= 10 ? "#f08c00" : "#c9c5e0"} />
          ))}
        </svg>
      );
    case "growth":
      return (
        <svg {...svg}>
          {[18, 15, 15, 11, 8, 6, 3].map((h, i) => (
            <rect key={i} x={30 + i * 28} y={64 - h * 3} width="18" height={h * 3} rx="4" fill={i === 6 ? "#d9f99d" : "#b9b2f5"} stroke={i === 6 ? "#16132b" : "none"} />
          ))}
        </svg>
      );
    default:
      return (
        <svg {...svg}>
          <rect x="40" y="8" width="72" height="58" rx="6" fill="#fff" stroke="#c9c5e0" />
          <rect x="128" y="8" width="72" height="58" rx="6" fill="#fff" stroke="#4b3bdb" />
          <path d="M52 30h48M52 42h36M140 30h48M140 42h36" stroke="#c9c5e0" strokeWidth="2" strokeLinecap="round" />
          <path d="M140 52h30" stroke="#8b80f9" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
        </svg>
      );
  }
}

/* ───────── cards ───────── */

function FeatureCard({ feature, onOpen, hidden }: { feature: Feature; onOpen: () => void; hidden: boolean }) {
  const { id, title, body, icon: I, chip, card, bodyText } = feature;
  const reduce = usePrefersReducedMotion();

  return (
    <motion.button
      type="button"
      layoutId={`feature-${id}`}
      data-feature={id}
      aria-haspopup="dialog"
      onClick={onOpen}
      className={`group flex h-full w-full cursor-pointer flex-col gap-3 rounded-[24px] border p-[26px] text-left shadow-hairline transition-[box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:shadow-lift ${card}`}
      style={{ opacity: hidden ? 0 : 1 }}
      transition={reduce ? { duration: 0 } : springs.gentle}
    >
      <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-md ${chip}`}>
        <I size={22} />
      </span>
      <span className="text-[20px] font-bold text-ink">{title}</span>
      <span className={`text-[16px] leading-[1.55] text-pretty ${bodyText}`}>{body}</span>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[14px] font-bold text-ink">
        More about it
        <ArrowRightIcon size={15} strokeWidth={2.2} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </span>
    </motion.button>
  );
}

function FeatureSheet({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, onClose);
  const { id, title, detail, icon: I, chip } = feature;
  return (
    <div className="fixed inset-0 z-[62] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-night/30 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: motionTokens.duration.fast } }}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        layoutId={`feature-${id}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`feature-${id}-title`}
        className="relative w-full max-w-lg rounded-[24px] border border-line bg-white shadow-[0_30px_80px_-20px_rgb(22_19_43/0.45)]"
        transition={reduce ? { duration: 0 } : springs.gentle}
      >
        <motion.div
          className="p-6 sm:p-8"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.08, duration: motionTokens.duration.normal } }}
        >
          <div className="flex items-start justify-between gap-4">
            <span className={`inline-flex size-12 items-center justify-center rounded-md ${chip}`}>
              <I size={22} />
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex size-11 items-center justify-center rounded-pill border border-line text-ink-muted transition-colors hover:bg-chrome-hover hover:text-ink"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          <h3 id={`feature-${id}-title`} className="mt-5 text-2xl font-extrabold tracking-[-0.03em] text-ink">
            {title}
          </h3>
          <p className="mt-3 text-[16px] leading-relaxed text-pretty text-ink-muted">{detail}</p>
          <div className="mt-6 flex justify-center rounded-md border border-line bg-desk py-4">
            <FeatureArt id={id} />
          </div>
          <div className="mt-6">
            <a href={APP_URL} className="btn btn-primary min-h-12 text-[15px]">
              Try it in TraceIt
              <ArrowUpRightIcon size={15} strokeWidth={2.4} />
            </a>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ───────── "See the details" ───────── */

function UnderTheHood({ href }: { href: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[24px] border border-dashed border-accent-line bg-accent-tint px-6 py-5 sm:px-7">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-md bg-white text-accent shadow-raised">
        <FlaskIcon size={22} />
      </span>
      <div className="min-w-0 flex-[1_1_320px]">
        <h3 className="text-[18px] font-bold text-ink">See the details</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-pretty text-ink-muted">
          See which signals fired for each moment (slower writing, extra erasing, going quiet while the lecturer kept
          talking, pen pressure) and how detection holds up against hand-labelled demo sessions, including what the
          threshold changes.
        </p>
      </div>
      <a href={href} className="btn btn-secondary min-h-12 text-[15px]">
        See how it’s checked
        <ArrowUpRightIcon size={15} strokeWidth={2.4} />
      </a>
    </div>
  );
}

/* ───────── language band ───────── */

function LanguageBand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = usePrefersReducedMotion();
  const [cycle, setCycle] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!inView || reduce || picked) return;
    const t = window.setInterval(() => setCycle((n) => (n + 1) % LANGUAGES.length), 2600);
    return () => clearInterval(t);
  }, [inView, reduce, picked]);

  const lang = LANGUAGES.find((l) => l.code === picked) ?? LANGUAGES[cycle];
  const fade = { duration: reduce ? 0 : motionTokens.duration.normal, ease: motionTokens.easing.smooth };

  return (
    <div ref={ref} className="card relative overflow-hidden rounded-[28px] p-6 sm:p-10">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">Help in your language</p>
          <p className="mt-5 font-display text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.12] font-extrabold tracking-[-0.035em] text-ink">
            <span className="text-ink-muted">“Explain it again in</span>
            {/* One line reserved for the language, so nothing below it moves while it changes. */}
            <span className="grid h-[1.3em] overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={lang.code}
                  className="col-start-1 row-start-1 text-accent"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: "0.5em" }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: "-0.5em" }}
                  transition={fade}
                >
                  <span lang={lang.code} dir={lang.rtl ? "rtl" : undefined}>
                    {lang.native}
                  </span>
                  <span className="text-ink-muted">”</span>
                </motion.span>
              </AnimatePresence>
            </span>
          </p>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-pretty text-ink-muted">
            Pick a language to see how TraceIt explains the same slip:{" "}
            <span className="font-mono text-[14px] whitespace-nowrap text-ink">d/dx sin(x²) = cos(x²)</span>.
          </p>
        </div>

        <div className="grid gap-5">
          <RadioGroup
            label="Language for the sample explanation"
            value={picked}
            onChange={setPicked}
            className="flex-wrap gap-2 lg:justify-end"
            optionClassName={(checked, code) =>
              `border px-3.5 text-[14px] font-semibold ${
                checked
                  ? "border-accent bg-accent text-on-accent"
                  : !picked && code === lang.code && !reduce
                    ? "border-accent-line bg-accent-soft text-accent-strong"
                    : "border-line bg-white text-ink-muted hover:border-accent-line hover:text-ink"
              }`
            }
            options={LANGUAGES.map((l) => ({
              value: l.code,
              label: l.native === l.name ? l.name : `${l.native} (${l.name})`,
              children: (
                <span lang={l.code} dir={l.rtl ? "rtl" : undefined}>
                  {l.native}
                </span>
              ),
            }))}
          />

          <figure className="rounded-lg border border-line bg-paper p-5 shadow-hairline">
            <figcaption className="flex items-center justify-between gap-3 text-[12px] font-bold tracking-[0.12em] text-ink-subtle uppercase">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 rounded-full bg-corrected" />
                Explanation · Fixed
              </span>
              <span className="tracking-normal normal-case">{lang.name}</span>
            </figcaption>
            <div className="mt-3 grid min-h-[5.5rem]" aria-live={picked ? "polite" : "off"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={lang.code}
                  data-testid="language-sample"
                  lang={lang.code}
                  dir={lang.rtl ? "rtl" : undefined}
                  className="col-start-1 row-start-1 text-[17px] leading-relaxed text-pretty text-ink"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                >
                  {lang.sample}
                </motion.p>
              </AnimatePresence>
            </div>
          </figure>
        </div>
      </div>
    </div>
  );
}

/** `labHref`: the app's evaluation page ("See the details"). */
export function Features({ labHref }: { labHref: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const feature = FEATURES.find((f) => f.id === open) ?? null;
  const close = useCallback(() => setOpen(null), []);

  return (
    <div className="grid gap-[18px]">
      <LayoutGroup>
        <Stagger className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          {FEATURES.map((f) => (
            <StaggerItem key={f.id} className="h-full">
              <FeatureCard feature={f} onOpen={() => setOpen(f.id)} hidden={open === f.id} />
            </StaggerItem>
          ))}
        </Stagger>
        <AnimatePresence>{feature && <FeatureSheet key={feature.id} feature={feature} onClose={close} />}</AnimatePresence>
      </LayoutGroup>
      <UnderTheHood href={labHref} />
      <LanguageBand />
    </div>
  );
}
