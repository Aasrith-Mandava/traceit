// The "desk" shell shared by the browse-and-plan pages (My notes, My progress, upload, classes,
// class insights, account): a white sidebar with the wordmark, the main nav (My notes, My progress),
// an "Upload a lecture" drop target, a classes link (teachers: "My classes"; students: "Join a
// class") and the signed-in user's chip (name → /account); the "messy = progress" note lives on an
// empty writing page instead (SessionCapture). On narrow screens it folds into a top bar with two
// tabs and the classes link + user chip on a row below.
// Capture, review and compare are focus screens and keep their own toolbars instead.
import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth/server";
import { countOpenGaps } from "@/lib/gaps";
import { ClassIcon, GrowthIcon, HomeIcon, PlusIcon, TraceItMark, UploadIcon } from "./icons";

export type DeskSection = "desk" | "growth" | "class" | "classes" | "upload" | "account";

const NAV: Array<{ key: DeskSection; href: string; label: string; Icon: typeof HomeIcon }> = [
  { key: "desk", href: "/app", label: "My notes", Icon: HomeIcon },
  { key: "growth", href: "/progress", label: "My progress", Icon: GrowthIcon },
];

export default async function DeskShell({ active, children }: { active: DeskSection; children: ReactNode }) {
  const user = await currentUser();
  const fuzzy = user ? await countOpenGaps(user.id) : 0;
  const teacher = user?.role === "teacher";
  // Class insights live under My classes; for students the same row is "Join a class".
  const classesCurrent = active === "classes" || active === "class";
  const badge =
    fuzzy === 0 ? (
      <span className="rounded-pill bg-ok-soft px-2.5 py-0.5 text-xs font-bold text-ok-strong">all clear</span>
    ) : (
      <span className="rounded-pill bg-gap-soft px-2.5 py-0.5 text-xs font-bold text-gap-strong tabular-nums">
        {fuzzy} to review
      </span>
    );

  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      {/* Keyboard users skip the sidebar's five stops straight to the page. */}
      <a
        href="#desk-content"
        className="sr-only z-30 rounded-md bg-accent px-4 py-3 font-bold text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      {/* Sticky only beside the page (lg+); on phones it scrolls away so the page keeps the screen. */}
      <aside
        aria-label="TraceIt"
        className="relative z-20 flex shrink-0 flex-col gap-3 border-b border-line bg-chrome px-4 pt-3 pb-2 lg:sticky lg:top-0 lg:h-dvh lg:w-[var(--sidebar-w)] lg:gap-7 lg:border-r lg:border-b-0 lg:px-5 lg:py-7"
      >
        {/* Narrow screens: the wordmark leaves room on the right for the upload link (pinned there). */}
        <div className="flex min-h-11 items-center pr-44 lg:pr-0">
          <Link href="/app" className="flex min-h-11 items-center gap-2.5 rounded-md px-2 text-ink">
            <TraceItMark size={30} />
            <span className="font-display text-2xl font-extrabold tracking-[-0.02em]">TraceIt</span>
          </Link>
        </div>

        {/* Phones: two equal tabs (icon over label); wide: a list. */}
        <nav aria-label="Main" className="grid grid-cols-2 gap-1 lg:flex lg:flex-col">
          {NAV.map(({ key, href, label, Icon }) => {
            const current = key === active;
            return (
              <Link
                key={key}
                href={href}
                aria-current={current ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[12px] px-1 text-center text-[12px] leading-tight transition-colors lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-[15px] lg:whitespace-nowrap ${
                  current
                    ? "bg-accent-soft font-bold text-accent-strong"
                    : "font-semibold text-ink-muted hover:bg-chrome-hover hover:text-ink"
                }`}
              >
                <Icon size={20} />
                {key === "growth" ? (
                  <>
                    {/* Wide: the status pill sits under the label (the sidebar is too narrow for both on
                        one line once it reads "N to review"). */}
                    <span className="flex flex-col items-center gap-0.5 lg:items-start">
                      {label}
                      <span className="hidden lg:contents">{badge}</span>
                    </span>
                    {/* Phones: the same status as a dot on the icon. */}
                    <span
                      className={`absolute top-1.5 left-[calc(50%+6px)] size-2.5 rounded-pill ring-2 ring-chrome lg:hidden ${
                        fuzzy === 0 ? "bg-corrected" : "bg-gap"
                      }`}
                    >
                      <span className="sr-only">{fuzzy === 0 ? "all clear" : `${fuzzy} to review`}</span>
                    </span>
                  </>
                ) : (
                  label
                )}
              </Link>
            );
          })}
        </nav>

        {/* One link for every width (a single data-testid): a dashed drop target under the nav on wide
            screens, a compact button pinned beside the wordmark on narrow ones. */}
        <Link
          href="/lectures/new"
          data-testid="add-lecture"
          aria-current={active === "upload" ? "page" : undefined}
          className="press absolute top-3 right-4 flex min-h-11 items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-accent-line bg-accent-tint px-3 text-sm font-bold text-accent-strong hover:border-accent hover:bg-accent-soft aria-[current=page]:border-solid aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft lg:static lg:min-h-12 lg:px-0 lg:text-[15px]"
        >
          <UploadIcon size={18} />
          Upload a lecture
        </Link>

        {/* Classes + who's signed in: a small row under the tabs on narrow screens; at the bottom of the
            sidebar, above the note, on wide ones. */}
        <nav
          aria-labelledby="desk-classes-label"
          className="flex items-center gap-2 border-t border-line pt-1.5 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-1.5 lg:pt-5"
        >
          <span
            id="desk-classes-label"
            className="sr-only text-xs font-extrabold tracking-[0.1em] text-ink-subtle uppercase lg:not-sr-only lg:px-3"
          >
            {teacher ? "For teachers" : "Classes"}
          </span>
          <Link
            href="/classes"
            data-testid={teacher ? "nav-classes" : "nav-join-class"}
            aria-current={classesCurrent ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2 rounded-[12px] px-3 text-sm whitespace-nowrap transition-colors lg:gap-3 lg:text-[15px] ${
              classesCurrent
                ? "bg-accent-soft font-bold text-accent-strong"
                : "font-semibold text-ink-muted hover:bg-chrome-hover hover:text-ink"
            }`}
          >
            {teacher ? <ClassIcon size={18} /> : <PlusIcon size={18} />}
            {teacher ? "My classes" : "Join a class"}
          </Link>
          {user ? (
            <Link
              href="/account"
              data-testid="user-menu"
              aria-current={active === "account" ? "page" : undefined}
              className={`ml-auto flex min-h-11 min-w-0 items-center gap-2.5 rounded-[12px] px-1.5 transition-colors lg:mt-1 lg:ml-0 lg:px-2 ${
                active === "account" ? "bg-accent-soft" : "hover:bg-chrome-hover"
              }`}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-accent text-sm font-extrabold text-on-accent"
              >
                {initialOf(user.name)}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span data-testid="user-menu-name" className="max-w-[9rem] truncate text-sm font-bold text-ink lg:max-w-none lg:text-[15px]">
                  {user.name}
                </span>
                <span className="sr-only lg:hidden">, your account</span>
                <span className="hidden text-xs font-semibold text-ink-subtle lg:block">
                  {user.role === "teacher" ? "Teacher" : "Student"}
                  {user.guest ? " · demo" : ""} · Account
                </span>
              </span>
            </Link>
          ) : (
            <Link
              href="/signin"
              className="ml-auto flex min-h-11 items-center rounded-[12px] px-3 text-sm font-bold text-accent hover:bg-accent-soft lg:ml-0"
            >
              Sign in
            </Link>
          )}
        </nav>
      </aside>

      <div id="desk-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col outline-none">
        {children}
      </div>
    </div>
  );
}

/** The first letter of a name, for the avatar circle. */
function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? "?").toUpperCase();
}
