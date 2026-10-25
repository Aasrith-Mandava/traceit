"use client";

// Highlighter-marker swipe behind a word or two of a heading: a skewed, slightly rotated,
// rounded lime band that sweeps left → right once when the heading scrolls into view. Static
// (already drawn) under reduced motion. The band is decorative; the text stays ink on a light
// lime wash (≥ 13:1).
import { useRef, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { motionTokens } from "@/lib/motion";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function Highlight({ children, delay = 0.15 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.8 });
  const reduce = usePrefersReducedMotion();
  const drawn = reduce || inView;
  return (
    <span ref={ref} className="relative isolate inline-block">
      <motion.span
        aria-hidden="true"
        data-marker=""
        className="absolute -inset-x-[0.14em] top-[0.38em] bottom-[0.02em] -z-10 rounded-[0.35em_0.55em_0.3em_0.6em] bg-highlight"
        style={{ originX: 0, rotate: -1.5, skewX: -10 }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: drawn ? 1 : 0 }}
        transition={
          reduce ? { duration: 0 } : { duration: motionTokens.duration.slow + 0.15, delay, ease: motionTokens.easing.smooth }
        }
      />
      {children}
    </span>
  );
}
