// Shared chrome primitives: button styles, the top toolbar shell, page headers, back link and the
// ghost-ink switch. The "Highlighter" look shared with the landing page (/welcome): solid ink-indigo
// primary buttons, outlined secondaries, white cards with hairline borders and soft indigo shadows.
import type { ReactNode } from "react";
import { Highlight } from "./motion/Highlight";
import { Reveal } from "./motion/Reveal";
import { GhostInkIcon } from "./icons";

const btnBase =
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-[15px] font-bold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-60";

/** Primary action: solid ink indigo with a soft glow. */
export const btnPrimary = `${btnBase} btn-metal px-5`;
/** Secondary action: white, outlined, indigo on hover. */
export const btnSecondary = `${btnBase} btn-quiet`;
/** Quiet inline action (links such as "Class insights", "Retry"): indigo text, soft indigo hover. */
export const btnLink =
  "press inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-bold text-accent hover:bg-accent-soft hover:text-accent-press";
export const iconBtn =
  "press inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-desk text-ink hover:bg-accent-soft hover:text-accent-strong active:bg-chrome-press";

/** White panel with a hairline border and a soft shadow (lists, forms, cards). */
export const panel = "panel";
/** The same panel as a divided list. */
export const panelList = "panel divide-y divide-line overflow-hidden";

/** App toolbar: white, hairline bottom border. Wraps onto a second row on narrow screens. */
export function TopBar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <header
      aria-label={label}
      className="relative z-10 flex min-h-[var(--toolbar-h)] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-chrome px-3 py-3 sm:px-6"
    >
      {children}
    </header>
  );
}

/** "‹ Back" for the focus screens' toolbars: back to where the student came from in the app. */
export { default as BackLink } from "./BackLink";

/**
 * A page's opening: eyebrow pill, bold title (pass a <Mark> around its key word) and a short lede.
 * Titles are h2 on pages whose toolbar already carries the h1.
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  as: H = "h2",
  children,
  titleTestId,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  as?: "h1" | "h2";
  children?: ReactNode;
  titleTestId?: string;
}) {
  return (
    <Reveal as="header" className="flex flex-col gap-3">
      <p className="eyebrow">{eyebrow}</p>
      <H className="page-title" data-testid={titleTestId}>
        {title}
      </H>
      {lede ? <p className="max-w-xl text-[16.5px] leading-relaxed text-pretty text-ink-muted">{lede}</p> : null}
      {children}
    </Reveal>
  );
}

/**
 * The lime highlighter-marker swipe behind the key word of a page title. Keep trailing punctuation
 * inside it (`<Mark>lost?</Mark>`): the marker is an inline-block, and Chrome would otherwise name
 * the heading "…lost ?".
 */
export const Mark = Highlight;

/** Section heading inside a page (Bricolage, bold ink). */
export function SectionTitle({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h3 id={id} className={`px-1 font-display text-lg font-bold text-ink ${className}`}>
      {children}
    </h3>
  );
}

/** Vertical divider between toolbar groups. */
export function Divider() {
  return <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />;
}

/**
 * "Show erased ink" switch. A real checkbox (role="switch") so it stays keyboard/AT friendly and keeps
 * check()/uncheck() semantics; the whole label is the tap target.
 */
export function GhostToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label
      className={`press flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-[13px] border-[1.5px] pr-2.5 pl-3.5 text-[15px] font-bold ${
        checked
          ? "border-accent-line bg-accent-soft text-accent-strong"
          : "border-transparent text-ink-muted hover:bg-chrome-hover"
      }`}
    >
      <GhostInkIcon size={18} className={checked ? "text-accent" : "text-ink-subtle"} />
      {/* Narrow phones: icon + switch only; the label stays for screen readers. */}
      <span className="sr-only whitespace-nowrap sm:not-sr-only">Show erased ink</span>
      <input
        type="checkbox"
        role="switch"
        data-testid="ghost-toggle"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="ghost-switch"
      />
    </label>
  );
}
