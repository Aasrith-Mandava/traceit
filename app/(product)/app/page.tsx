import Link from "next/link";
import { connection } from "next/server";
import type { CSSProperties } from "react";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { countOpenGaps } from "@/lib/gaps";
import { DEMO_LECTURE } from "@/lib/demo";
import type { Session } from "@/lib/types";
import DeskShell from "@/components/DeskShell";
import NewSessionButton from "@/components/NewSessionButton";
import LiveLectureStart from "@/components/LiveLectureStart";
import { liveLectureDisabled } from "@/lib/liveLecture";
import { MomentGlyph } from "@/components/Timeline";
import { CheckIcon, ChevronRightIcon, MicIcon, PlayIcon } from "@/components/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Mark } from "@/components/ui";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

// Notebook-card counts in the desk's words: lines drawn are "pen strokes", erased parts are "ghosts".
const penStrokes = (n: number) => `${n} pen ${n === 1 ? "stroke" : "strokes"}`;
const ghostsSaved = (n: number) => `${n} ${n === 1 ? "ghost" : "ghosts"} saved`;

/** The notebook cover on each card: ruled paper, pink margin, the lecture's name in handwriting. */
function NotebookThumb({ lectureTitle, ghosts }: { lectureTitle: string; ghosts: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ "--rule-gap": "30px" } as CSSProperties}
      className="paper-plain relative block h-[150px] overflow-hidden rounded-t-[21px] border-b border-line bg-paper"
    >
      <span className="absolute inset-y-0 left-[34px] w-[1.5px] bg-margin" />
      <span className="absolute top-2 right-5 left-12 line-clamp-2 -rotate-1 font-hand text-2xl leading-[30px] text-pen">
        {lectureTitle}
      </span>
      {/* A couple of scribbled lines; a dashed ghost line when something was rubbed out. */}
      <svg
        viewBox="0 0 240 60"
        preserveAspectRatio="none"
        fill="none"
        strokeLinecap="round"
        className="absolute top-[66px] left-12 h-[60px] w-[calc(100%-80px)]"
      >
        <path d="M2 20c18-8 30 6 48-2s28-6 44 0 30-8 52-2 24 4 40-1" stroke="var(--color-pen)" strokeWidth="2" opacity=".5" vectorEffect="non-scaling-stroke" />
        <path d="M2 50c14-6 26 4 40-1s22-5 36 0" stroke="var(--color-pen)" strokeWidth="2" opacity=".5" vectorEffect="non-scaling-stroke" />
        {ghosts > 0 ? (
          <path d="M96 50c12-7 24 5 38-1s24-4 40 1" stroke="var(--color-ghost)" strokeWidth="2" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {ghosts > 0 ? (
        <span className="absolute right-3.5 bottom-3 rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">ghost ink</span>
      ) : null}
    </span>
  );
}

/**
 * The strip under the start cards: green "Nothing to review right now" when every fuzzy spot is cleared,
 * orange with the count while some are still fuzzy. Both lead to My progress.
 */
function OpenGapsStrip({ openGaps }: { openGaps: number }) {
  return (
    <Link
      href="/progress"
      data-testid="open-gaps-link"
      className={`group flex flex-wrap items-center gap-3.5 rounded-[18px] px-5 py-4 text-ink transition-shadow hover:shadow-raised ${
        openGaps === 0 ? "bg-ok-soft" : "bg-gap-soft"
      }`}
    >
      <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-white">
        {openGaps === 0 ? (
          <CheckIcon size={18} strokeWidth={2.6} className="text-ok-strong" />
        ) : (
          <MomentGlyph type="unresolved_gap" size={14} />
        )}
      </span>
      <span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
        {openGaps === 0 ? (
          <>
            <span className="text-base font-bold">Nothing to review right now</span>
            <span className="text-sm text-ink-muted">
              <span data-testid="open-gaps-count" className="font-semibold tabular-nums">
                {openGaps}
              </span>{" "}
              still fuzzy · every fuzzy spot so far is cleared
            </span>
          </>
        ) : (
          <>
            <span className="text-base font-bold">
              <span data-testid="open-gaps-count" className="tabular-nums">
                {openGaps}
              </span>{" "}
              {openGaps === 1 ? "fuzzy spot" : "fuzzy spots"} left
            </span>
            <span className="text-sm text-ink-muted">
              Worth another look before your next lecture. Your notes kept every clue.
            </span>
          </>
        )}
      </span>
      <span
        className={`inline-flex items-center gap-1 text-[15px] font-bold ${
          openGaps === 0 ? "text-ok-strong" : "text-gap-strong"
        }`}
      >
        See your progress
        <ChevronRightIcon size={16} strokeWidth={2.4} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** One notebook on the desk: its cover, title, date · lecture, ink counts, Keep writing / Review. */
function NotebookCard({
  session: s,
  lectureTitle,
  counts,
}: {
  session: Session;
  lectureTitle: string;
  counts: { drawn: number; erasedParts: number };
}) {
  const d = new Date(s.createdAtIso);
  return (
    <StaggerItem
      as="li"
      className="panel relative flex max-w-[520px] flex-col shadow-none transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-card"
    >
      {/* The whole card opens the notebook; "Review" sits on top, in the space reserved below. */}
      <Link
        href={`/session/${s.id}`}
        data-testid="session-link"
        className="group flex flex-1 flex-col rounded-lg"
      >
        <NotebookThumb lectureTitle={lectureTitle} ghosts={counts.erasedParts} />
        <span className="flex flex-1 flex-col gap-3 px-5 pt-[18px] pb-5">
          <span className="flex min-w-0 flex-col gap-1">
            <h3 className="truncate font-sans text-lg font-bold tracking-normal text-ink">{s.title}</h3>
            <span className="text-sm text-ink-subtle">
              <span className="tabular-nums">
                {dateFmt.format(d)} · {timeFmt.format(d)}
              </span>
              <span aria-hidden="true"> · </span>
              <span data-testid="session-lecture">{lectureTitle}</span>
            </span>
          </span>
          <span
            data-testid="session-stroke-count"
            data-drawn={counts.drawn}
            data-erased-parts={counts.erasedParts}
            className="flex flex-wrap gap-2"
          >
            <span className="rounded-pill bg-desk px-2.5 py-1 font-mono text-[13px] font-medium text-ink-muted tabular-nums">
              {penStrokes(counts.drawn)}
            </span>
            {counts.erasedParts > 0 ? (
              <span className="rounded-pill border border-dashed border-ghost bg-accent-soft px-2.5 py-1 text-[13px] font-bold text-accent tabular-nums">
                {ghostsSaved(counts.erasedParts)}
              </span>
            ) : null}
          </span>
          <span className="mt-auto flex gap-2.5">
            <span className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[12px] border-[1.5px] border-line text-[15px] font-bold text-ink transition-colors group-hover:border-accent group-hover:text-accent-strong">
              Keep writing
            </span>
            {/* Placeholder under the "Review" link. */}
            <span aria-hidden="true" className="flex-1" />
          </span>
        </span>
      </Link>
      <Link
        href={`/review/${s.id}`}
        aria-label={`Review ${s.title}`}
        className="press absolute right-5 bottom-5 inline-flex min-h-11 w-[calc(50%-25px)] items-center justify-center gap-1.5 rounded-[12px] bg-night text-[15px] font-bold text-white hover:bg-accent"
      >
        Review
        <ChevronRightIcon size={16} strokeWidth={2.4} />
      </Link>
    </StaggerItem>
  );
}

export default async function Home(props: PageProps<"/app">) {
  // Always read fresh sessions at request time (never prerender the list).
  await connection();
  const user = await requireUser("/app");
  const db = getDb();
  const [ownSessions, lectures, searchParams, openGaps, strokeCounts] = await Promise.all([
    db.listStudentSessions(user.id),
    // The picker: the bundled demo, the user's own uploads and their classes' lectures.
    db.listVisibleLectures(user.id),
    props.searchParams,
    countOpenGaps(user.id),
    // One aggregate query for every card (lines drawn / erased parts, as on the capture screen).
    db.sessionStrokeCounts(user.id),
  ]);
  // The signed-in student's notebooks, newest first.
  const sessions = ownSessions.reverse();
  const lectureTitles = new Map(lectures.map((l) => [l.id, l.title]));
  // After an upload the new lecture arrives pre-selected (?lecture=<id>).
  const requested = typeof searchParams.lecture === "string" ? searchParams.lecture : undefined;
  const defaultLectureId = requested && lectureTitles.has(requested) ? requested : DEMO_LECTURE.lectureId;

  return (
    <DeskShell active="desk">
      <main className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12">
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-10">
          <Reveal as="section" className="relative flex flex-col gap-[18px]">
            <p className="eyebrow">Notes that remember</p>
            <h1
              data-testid="tagline"
              className="page-title max-w-[980px] text-[clamp(2.5rem,5.4vw,4.25rem)] tracking-[-0.035em]"
            >
              Take notes as usual.{" "}
              <br className="max-sm:hidden" />
              TraceIt spots <Mark>what didn’t click.</Mark>
            </h1>
            <p className="max-w-[600px] text-lg leading-relaxed text-pretty text-ink-muted">
              Write along with any lecture. Whatever you scratch out lingers as faint ghost ink, and each fix becomes a
              stop on your learning trail.
            </p>
            {/* Margin note in the hero's empty corner (wide screens only, where it can't touch the title). */}
            <span
              aria-hidden="true"
              className="hand-note absolute top-6 right-0 hidden -rotate-6 text-center text-[28px] leading-none min-[1360px]:block"
            >
              your eraser,
              <br />
              but honest ↓
            </span>
          </Reveal>

          <section
            aria-label="Start a session"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5"
          >
            <Reveal delay={0.05} className="panel flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-white">
                  <PlayIcon size={20} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-[21px] font-bold tracking-[-0.01em] text-ink">Study a recorded lecture</h2>
                  <span className="text-sm text-ink-subtle">Press play, pick up your pen</span>
                </div>
              </div>
              <NewSessionButton key={defaultLectureId} lectures={lectures} defaultLectureId={defaultLectureId} />
            </Reveal>

            <Reveal delay={0.1} className="panel flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-breakthrough-soft text-breakthrough-strong"
                >
                  <MicIcon size={20} strokeWidth={2.2} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-[21px] font-bold tracking-[-0.01em] text-ink">In the lecture hall</h2>
                  <span className="text-sm text-ink-subtle">Capture the room while you scribble</span>
                </div>
              </div>
              <LiveLectureStart available={!liveLectureDisabled(process.env)} />
            </Reveal>
          </section>

          {sessions.length > 0 ? <OpenGapsStrip openGaps={openGaps} /> : null}

          <section aria-labelledby="sessions-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 id="sessions-heading" className="text-[26px] font-bold text-ink">
                Pick up where you left off
              </h2>
              {sessions.length > 0 ? (
                <span className="text-sm tabular-nums text-ink-subtle">
                  {sessions.length} {sessions.length === 1 ? "notebook" : "notebooks"}
                </span>
              ) : null}
            </div>

            {sessions.length === 0 ? (
              <div className="panel flex min-h-44 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <span
                  aria-hidden="true"
                  style={{ "--rule-gap": "7px" } as CSSProperties}
                  className="paper mb-1 size-11 rounded-md border border-line shadow-raised"
                />
                <p className="font-display text-lg font-bold text-ink">No notes yet</p>
                <p className="max-w-sm text-sm text-pretty text-ink-muted">
                  Pick a lecture above and start writing. Every notebook you fill lands here.
                </p>
              </div>
            ) : (
              <Stagger
                as="ul"
                data-testid="session-list"
                className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5"
              >
                {sessions.map((s) => {
                  const counts = strokeCounts.get(s.id) ?? { drawn: 0, erasedParts: 0 };
                  const lectureTitle = lectureTitles.get(s.lectureId) ?? "Unknown lecture";
                  return <NotebookCard key={s.id} session={s} lectureTitle={lectureTitle} counts={counts} />;
                })}
              </Stagger>
            )}
          </section>
        </div>
      </main>
    </DeskShell>
  );
}
