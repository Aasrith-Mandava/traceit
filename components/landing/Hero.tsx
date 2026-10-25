"use client";

/*
 * TraceIt header + hero, "Highlighter" edition (the Welcome artboard).
 *
 *  - Header: sticky; the wordmark, the section nav (The idea / What's inside / Educators /
 *    Questions) and a dark "Launch TraceIt" button. It gains a frosted desk-coloured bar once you
 *    scroll, and folds into a menu button below lg (Escape closes the menu and returns focus).
 *  - Hero: the "NEW" pill, the headline with a pink squiggle under "hiding", the lede, the two CTAs
 *    and the small print, beside a tilted notebook page whose faded (ghost) answers and moment chips
 *    show what TraceIt keeps. The page is decorative: everything on it is said again, in words,
 *    further down.
 *  - prefers-reduced-motion: entrances land instantly.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { APP_URL, NAV_LINKS } from "@/components/landing/site";
import { ArrowRightIcon, ArrowUpRightIcon, CloseIcon, TraceItMark, MenuIcon, PlayIcon } from "@/components/landing/icons";
import { usePrefersReducedMotion } from "@/components/motion/usePrefersReducedMotion";
import { motionTokens } from "@/lib/motion";

/* ───────────── header ───────────── */

function subscribeScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
}
const useScrolled = () =>
  useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 12,
    () => false,
  );

export function SiteHeader() {
  const reduce = usePrefersReducedMotion();
  const scrolled = useScrolled();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the menu and hands focus back to its button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const solid = scrolled || open;

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
        solid ? "border-line bg-desk/90 shadow-hairline backdrop-blur-md" : "border-transparent"
      }`}
    >
      <div className="container-x flex h-[var(--nav-h)] items-center gap-3 lg:gap-7">
        <a
          href="#top"
          aria-label="TraceIt, back to top"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md text-ink"
        >
          <TraceItMark size={30} />
          <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">TraceIt</span>
        </a>

        <nav aria-label="Primary" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1.5">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-white hover:text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <a href={APP_URL} className="btn btn-dark min-h-[46px] px-3.5 text-[15px] sm:px-5">
            Launch TraceIt
            <ArrowUpRightIcon size={16} strokeWidth={2.4} className="hidden sm:block" />
          </a>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md border border-line-strong bg-white text-ink lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile"
            className="border-t border-line lg:hidden"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -motionTokens.distance.sm }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: motionTokens.duration.fast } }}
            transition={{ duration: motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
          >
            <ul className="container-x flex flex-col py-2">
              {NAV_LINKS.map((l) => (
                <li key={l.href} className="border-b border-line last:border-b-0">
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center justify-between text-[17px] font-semibold text-ink"
                  >
                    {l.label}
                    <ArrowRightIcon size={16} className="text-ink-subtle" />
                  </a>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ───────────── the notebook page beside the headline (decorative) ───────────── */

/** Faded, outlined handwriting: an attempt you rubbed out, kept as a ghost. */
function Ghost({ children }: { children: string }) {
  return <span className="text-transparent [-webkit-text-stroke:1.3px_var(--color-ghost)]">{children}</span>;
}

function HeroNotebook() {
  return (
    <div aria-hidden="true" className="relative min-h-[430px] min-w-0 flex-[1_1_460px] sm:min-h-[470px]">
      <div className="notebook absolute inset-[20px_22px_24px_6px] -rotate-2 overflow-hidden rounded-[10px_10px_22px_22px] shadow-[0_2px_0_rgb(22_19_43/0.04),0_40px_80px_-36px_rgb(40_30_120/0.45)] sm:inset-[20px_30px_20px_10px]">
        <span className="absolute inset-y-0 left-[42px] w-0.5 bg-margin sm:left-[50px]" />
        <div className="pt-[18px] pr-4 pl-[56px] font-hand text-[26px] leading-[var(--nb-rule)] whitespace-nowrap text-pen sm:pt-[26px] sm:pr-5 sm:pl-[70px] sm:text-[33px]">
          <div>chain rule</div>
          <div>y = f(g(x))</div>
          <div>
            dy/dx = <Ghost>2(3x+1)</Ghost> 6(3x+1)
          </div>
          <div>d/dx sin(x²) =</div>
          <div>
            <span className="rounded-[10px] border-2 border-dashed border-corrected bg-corrected-soft/75 px-2">
              <Ghost>cos(x²)</Ghost> cos(x²) · 2x
            </span>
          </div>
          <div>
            <span className="bg-[linear-gradient(transparent_55%,rgb(255_193_102/0.6)_55%,rgb(255_193_102/0.6)_92%,transparent_92%)]">
              product vs chain
            </span>
            ?
          </div>
          <div>x·sin x → product</div>
        </div>
      </div>

      {/* Moment chips: Aha moment ◆ pink, Fixed ● green, Still fuzzy ○ orange. */}
      <div className="absolute top-6 right-0 flex rotate-3 items-center gap-2.5 rounded-[16px] bg-white px-3.5 py-2.5 shadow-float">
        <span className="size-3 rotate-45 bg-breakthrough" />
        <span className="font-mono text-[13px] text-ink-subtle">01:02</span>
        <span className="text-[15px] font-bold text-ink">Aha moment</span>
      </div>
      <div className="absolute top-[200px] -left-1 flex -rotate-3 items-center gap-2.5 rounded-[16px] bg-night px-3.5 py-2.5 text-white shadow-[0_18px_40px_-18px_rgb(22_19_43/0.5)] sm:top-[210px] sm:-left-3">
        <span className="size-3 rounded-full bg-[#34d399]" />
        <span className="font-mono text-[13px] text-night-text">01:40</span>
        <span className="text-[14px] font-bold sm:text-[15px]">Fixed: remembered the inner 2x</span>
      </div>
      <div className="absolute right-2.5 bottom-[30px] flex rotate-2 items-center gap-2.5 rounded-[16px] bg-white px-3.5 py-2.5 shadow-float">
        <span className="size-[13px] rounded-full border-[3px] border-gap" />
        <span className="font-mono text-[13px] text-ink-subtle">04:10</span>
        <span className="text-[15px] font-bold text-ink">Still fuzzy</span>
      </div>
      <span className="hand-note absolute -bottom-1.5 left-4 -rotate-[5deg] text-[22px] sm:left-[30px] sm:text-[26px]">
        ↑ the faded bits are what you erased
      </span>
    </div>
  );
}

/* ───────────── the hero ───────────── */

export function Hero() {
  const reduce = usePrefersReducedMotion();

  // Same start/end either way (hydration renders the motion-allowed branch first); reduced motion
  // just lands there without the rise.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: motionTokens.distance.md },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: motionTokens.duration.slow, delay, ease: motionTokens.easing.smooth },
  });

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="container-x flex flex-wrap items-center gap-12 pt-8 pb-20 sm:pt-10"
    >
      <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-[22px]">
        <motion.p
          className="inline-flex items-center gap-2 self-start rounded-pill border border-line bg-white py-1.5 pr-3.5 pl-2 text-[13px] font-bold text-accent-strong sm:text-[14px]"
          {...rise(0.05)}
        >
          <span className="rounded-pill bg-highlight px-2 py-0.5 text-[12px] text-on-highlight">NEW</span>
          Study notes that learn from your mistakes
        </motion.p>

        <motion.h1
          id="hero-title"
          className="font-display text-[clamp(48px,6.6vw,92px)] leading-[0.95] font-extrabold tracking-[-0.045em] text-ink"
          {...rise(0.15)}
        >
          Your eraser is{" "}
          <span className="relative inline-block">
            hiding
            <svg
              viewBox="0 0 300 20"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
              className="absolute -bottom-2.5 -left-[2%] h-[18px] w-[104%]"
            >
              <path
                d="M4 14 C 60 4, 120 4, 170 10 S 260 16, 296 6"
                fill="none"
                stroke="var(--color-breakthrough)"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </svg>
          </span>{" "}
          the good stuff.
        </motion.h1>

        <motion.p className="max-w-[560px] text-[18px] leading-[1.55] text-ink-muted sm:text-[20px]" {...rise(0.25)}>
          TraceIt quietly watches how you write during a lecture (the pauses, the scratch-outs, the do-overs) and
          turns them into a trail of what you fixed, what still feels fuzzy, and the exact second of lecture behind
          each one.
        </motion.p>

        <motion.div className="flex flex-wrap gap-3" {...rise(0.35)}>
          <a href={APP_URL} className="btn btn-primary min-h-[54px] rounded-[16px] px-[26px] text-[17px]">
            Try the live demo
            <ArrowRightIcon size={18} strokeWidth={2.4} />
          </a>
          <a href="#demo" className="btn btn-secondary min-h-[54px] rounded-[16px] px-[22px] text-[17px]">
            <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-pill bg-highlight text-on-highlight">
              <PlayIcon size={12} />
            </span>
            See it in action
          </a>
        </motion.div>

        <motion.p className="text-[14px] text-ink-subtle" {...rise(0.45)}>
          Runs in the browser · nothing to install · sample lecture ready to go
        </motion.p>
      </div>

      <HeroNotebook />
    </section>
  );
}
