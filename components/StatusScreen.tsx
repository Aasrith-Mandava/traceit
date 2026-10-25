// Full-page status screens (not found, something went wrong) in the desk's language: the wordmark,
// then one white card topped by a strip of notebook paper with the status scribbled in ghost ink,
// an eyebrow pill, a bold title with the lime marker, a short lede and a way back to your notes. No
// sidebar: these also render outside the app's data (global 404, client error boundary).
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { TraceItMark } from "./icons";
import { Mark, btnPrimary, btnSecondary } from "./ui";

export function StatusScreen({
  eyebrow,
  title,
  lede,
  actions,
  scribble = eyebrow,
}: {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
  /** Written on the paper strip as a faded ghost (decorative). */
  scribble?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-8">
      <Link href="/welcome" aria-label="TraceIt" className="inline-flex min-h-11 items-center gap-2.5 self-start rounded-md px-1 text-ink">
        <TraceItMark size={30} />
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">TraceIt</span>
      </Link>
      <div className="panel flex flex-col">
        <div
          aria-hidden="true"
          style={{ "--rule-gap": "30px" } as CSSProperties}
          className="paper-plain relative h-28 overflow-hidden rounded-t-[21px] border-b border-line bg-paper"
        >
          <span className="absolute inset-y-0 left-[34px] w-[1.5px] bg-margin" />
          <span className="absolute top-3 left-12 -rotate-2 font-hand text-[64px] leading-none font-bold whitespace-nowrap text-transparent [-webkit-text-stroke:1.5px_var(--color-ghost)]">
            {scribble}
          </span>
        </div>
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          <p className="text-[17px] leading-relaxed text-pretty text-ink-muted">{lede}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {actions ?? (
              <>
                <Link href="/app" className={btnPrimary}>
                  Back to my notes
                </Link>
                <Link href="/welcome" className={btnSecondary}>
                  What’s TraceIt?
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export function NotFoundScreen() {
  return (
    <StatusScreen
      eyebrow="Page not found"
      scribble="404"
      title={
        <>
          This page is still <Mark>blank.</Mark>
        </>
      }
      lede="It doesn’t exist, or the notebook it pointed to has been removed. Your notes are safe where you left them."
    />
  );
}
