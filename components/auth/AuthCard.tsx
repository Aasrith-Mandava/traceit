// The public account pages' frame (sign in, sign up, join a class while signed out): the TraceIt
// wordmark over one centered white card in the Highlighter style. No sidebar.
import Link from "next/link";
import type { ReactNode } from "react";
import { TraceItMark } from "../icons";

/** Text inputs on the account pages (same look as the upload form's fields). */
export const inputClass =
  "min-h-12 w-full rounded-md border-[1.5px] border-line bg-chrome-hover px-3.5 text-base font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-accent-line focus-visible:border-accent";
export const labelClass = "kicker tracking-[0.08em] text-ink-subtle";
/** The error line under a form (data-testid="auth-error"). */
export const errorClass = "rounded-[14px] bg-gap-soft px-4 py-3 text-sm text-pretty text-gap-strong";

export default function AuthCard({
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col justify-center gap-6 px-4 py-12 sm:px-6">
      <Link href="/welcome" className="inline-flex min-h-11 items-center gap-2.5 self-start rounded-md px-1 text-ink">
        <TraceItMark size={30} />
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">TraceIt</span>
      </Link>
      <div className="panel flex flex-col gap-5 p-6 sm:p-8">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title text-[clamp(2rem,7vw,2.6rem)] leading-[1.05]">{title}</h1>
          {lede ? <p className="text-[16px] leading-relaxed text-pretty text-ink-muted">{lede}</p> : null}
        </header>
        {children}
      </div>
      {footer ? <p className="text-center text-[15px] text-ink-muted">{footer}</p> : null}
    </main>
  );
}
