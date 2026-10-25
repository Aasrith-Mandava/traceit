import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getProgress } from "@/lib/gaps";
import { hotspotBars, hotspotSourceLabel } from "@/lib/hotspots";
import DeskShell from "@/components/DeskShell";
import HotspotSparkline from "@/components/HotspotSparkline";
import { RESOLVED_SHORT, formatDay, ordinal, type ProgressThread } from "@/lib/progress";
import { formatClock } from "@/lib/time";
import { MomentGlyph } from "@/components/Timeline";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { Mark } from "@/components/ui";

export const metadata: Metadata = { title: "My progress · TraceIt" };

type Filter = "open" | "resolved" | "all";
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "open", label: "Still fuzzy" },
  { value: "resolved", label: "Cleared" },
  { value: "all", label: "Everything" },
];

/** Literal classes per "at a glance" card: the first one is dark, with its number in lime. */
const STAT_TONE = {
  night: { card: "bg-night text-white", value: "text-highlight", label: "text-night-text" },
  plain: { card: "border border-line bg-white", value: "text-ink", label: "text-ink-subtle" },
  accent: { card: "border border-line bg-white", value: "text-accent", label: "text-ink-subtle" },
} as const;

function Stat({ value, label, tone }: { value: number; label: string; tone: keyof typeof STAT_TONE }) {
  const c = STAT_TONE[tone];
  return (
    <div className={`flex flex-col gap-1 rounded-[20px] px-5 py-[18px] ${c.card}`}>
      <span className={`font-display text-[40px] leading-none font-extrabold tabular-nums ${c.value}`}>{value}</span>
      <span className={`text-sm ${c.label}`}>{label}</span>
    </div>
  );
}

const EMPTY: Record<Filter, { title: string; body: string }> = {
  open: { title: "Nothing still fuzzy", body: "Every fuzzy spot you hit has been untangled." },
  resolved: {
    title: "Nothing cleared yet",
    body: "When your notes show you got stuck, it lands here, and follows you into your next session.",
  },
  all: {
    title: "No fuzzy spots yet",
    body: "When your notes show you got stuck, it lands here, and follows you into your next session.",
  },
};

function ThreadRow({ t }: { t: ProgressThread }) {
  const open = t.status === "open";
  return (
    <StaggerItem as="li">
      <Link
        href={`/review/${t.latest.sessionId}?moment=${encodeURIComponent(t.latest.eventId)}`}
        data-testid="progress-thread"
        data-status={t.status}
        data-root-id={t.rootId}
        data-event-id={t.latest.eventId}
        data-resolved-by={t.resolvedBy ?? ""}
        className="group flex flex-wrap items-center gap-3.5 rounded-[20px] border border-line bg-white px-4 py-4 text-ink transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-card sm:px-5"
      >
        <span
          aria-hidden="true"
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-pill ${
            open ? "bg-gap-soft" : "bg-ok-soft text-ok-strong"
          }`}
        >
          {open ? <MomentGlyph type="unresolved_gap" size={14} /> : <CheckIcon size={18} strokeWidth={2.6} />}
        </span>
        <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-[3px]">
          <span className="text-[17px] font-bold text-pretty" data-testid="progress-thread-label">
            {t.label}
          </span>
          <span className="flex flex-wrap gap-x-1.5 text-sm text-ink-subtle">
            <span className="font-mono tabular-nums text-ink">{formatClock(t.latest.lectureMs)}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">first spotted {formatDay(t.firstSeenIso)}</span>
            {t.occurrences > 1 ? (
              <>
                <span aria-hidden="true">·</span>
                <span data-testid="progress-thread-repeat" className="font-semibold text-gap-strong">
                  {ordinal(t.occurrences)} time
                </span>
              </>
            ) : null}
            {!open && t.resolvedBy ? (
              <>
                <span aria-hidden="true">·</span>
                <span data-testid="progress-thread-resolved" className="font-semibold text-ok-strong">
                  {RESOLVED_SHORT[t.resolvedBy]}
                  {t.resolvedAtIso ? ` ${formatDay(t.resolvedAtIso)}` : ""}
                </span>
              </>
            ) : null}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span
            className={`rounded-pill px-3 py-[5px] text-[13px] font-bold ${
              open ? "bg-gap-soft text-gap-strong" : "bg-ok-soft text-ok-strong"
            }`}
          >
            {open ? "Still fuzzy" : "Cleared"}
          </span>
          <ChevronRightIcon size={18} strokeWidth={2.4} className="text-ink-subtle transition-colors group-hover:text-accent" />
        </span>
      </Link>
    </StaggerItem>
  );
}

export default async function ProgressPage(props: PageProps<"/progress">) {
  await connection();
  const user = await requireUser("/progress");
  const [progress, searchParams] = await Promise.all([getProgress(user.id), props.searchParams]);
  const requested = searchParams.status;
  const filter: Filter = requested === "open" || requested === "resolved" ? requested : "all";
  const counts: Record<Filter, number> = {
    open: progress.openCount,
    resolved: progress.resolvedCount,
    all: progress.openCount + progress.resolvedCount,
  };
  const lectures = progress.lectures
    .map((l) => ({ ...l, threads: l.threads.filter((t) => filter === "all" || t.status === filter) }))
    .filter((l) => l.threads.length > 0);

  // Context per lecture: where the student erased most across their sessions (TimescaleDB
  // time_bucket on Tiger Data; the same numbers computed in SQL/TypeScript elsewhere). Best effort. Loaded for every
  // lecture with fuzzy spots (not just the filtered ones) so the "at a glance" total doesn't move with the tab.
  const db = getDb();
  const [info, allLectures] = await Promise.all([db.info().catch(() => null), db.listVisibleLectures(user.id)]);
  const durations = new Map(allLectures.map((l) => [l.id, l.durationMs]));
  const hotspots = new Map(
    await Promise.all(
      progress.lectures.map(async (l) => {
        // The student's own sessions only (their teacher sees the class on Class insights).
        const list = await db.lectureInkHotspots(l.lectureId, [user.id]).catch(() => []);
        return [l.lectureId, hotspotBars(list, durations.get(l.lectureId) ?? 0)] as const;
      }),
    ),
  );
  const erasedTotal = [...hotspots.values()].reduce((n, bars) => n + bars.reduce((m, b) => m + b.erased, 0), 0);
  const source = info ? hotspotSourceLabel(info) : "";

  return (
    <DeskShell active="growth">
      <main
        data-testid="progress-page"
        data-filter={filter}
        className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12"
      >
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
          <Reveal as="header" className="flex flex-col gap-3.5">
            <p className="text-xs font-extrabold tracking-[0.12em] text-accent uppercase">My progress</p>
            <h1 className="page-title max-w-[760px] text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.04] tracking-[-0.035em]">
              Where you got stuck, and how you got <Mark>unstuck.</Mark>
            </h1>
            <p className="max-w-[620px] text-[17px] leading-relaxed text-pretty text-ink-muted">
              Every fuzzy spot you hit, grouped by lecture. A fuzzy spot clears itself once you breeze through that
              part in a later session, or once you tell TraceIt it finally clicked.
            </p>
          </Reveal>

          <section aria-label="At a glance" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3.5">
            <Stat tone="night" value={progress.resolvedCount} label={progress.resolvedCount === 1 ? "fuzzy spot cleared" : "fuzzy spots cleared"} />
            <Stat tone="plain" value={progress.openCount} label="still fuzzy" />
            <Stat tone="accent" value={erasedTotal} label="erased strokes analysed" />
          </section>

          <nav
            aria-label="Filter fuzzy spots"
            className="flex flex-wrap gap-1 self-start rounded-[16px] border border-line bg-white p-[5px]"
          >
            {FILTERS.map((f) => {
              const active = f.value === filter;
              return (
                <Link
                  key={f.value}
                  href={f.value === "all" ? "/progress" : `/progress?status=${f.value}`}
                  data-testid={`progress-filter-${f.value}`}
                  aria-current={active ? "page" : undefined}
                  className={`press inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-4 text-[15px] font-bold ${
                    active ? "bg-ink text-white" : "text-ink-muted hover:bg-chrome-hover hover:text-ink"
                  }`}
                >
                  {f.label}
                  <span className={`font-semibold tabular-nums ${active ? "text-highlight" : "text-ink-subtle"}`}>
                    {counts[f.value]}
                  </span>
                </Link>
              );
            })}
          </nav>

          {lectures.length === 0 ? (
            <div
              data-testid="progress-empty"
              className="panel flex min-h-44 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
            >
              <MomentGlyph type="unresolved_gap" size={18} className="mb-1" />
              <p className="font-display text-lg font-bold text-ink">{EMPTY[filter].title}</p>
              <p className="max-w-sm text-sm text-pretty text-ink-muted">{EMPTY[filter].body}</p>
            </div>
          ) : (
            lectures.map((l) => {
              const bars = hotspots.get(l.lectureId) ?? [];
              return (
                <section
                  key={l.lectureId}
                  data-testid="progress-lecture"
                  data-lecture-id={l.lectureId}
                  aria-labelledby={`lecture-${l.lectureId}`}
                  className="flex flex-col gap-3.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
                    <h2 id={`lecture-${l.lectureId}`} className="text-[22px] font-bold tracking-[-0.01em] text-ink">
                      {l.lectureTitle}
                    </h2>
                    <span className="text-sm tabular-nums text-ink-subtle">
                      {l.openCount} fuzzy · {l.resolvedCount} cleared
                    </span>
                  </div>
                  {bars.some((b) => b.strokes > 0) ? (
                    <HotspotSparkline
                      bars={bars}
                      durationMs={durations.get(l.lectureId) ?? 0}
                      source={source}
                      lectureTitle={l.lectureTitle}
                    />
                  ) : null}
                  <Stagger as="ul" className="flex flex-col gap-3">
                    {l.threads.map((t) => (
                      <ThreadRow key={t.rootId} t={t} />
                    ))}
                  </Stagger>
                </section>
              );
            })
          )}
        </div>
      </main>
    </DeskShell>
  );
}
