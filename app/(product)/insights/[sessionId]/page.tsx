import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { analyzeSession, getTimeline } from "@/lib/analyze";
import { ownedSession } from "@/lib/access";
import { requireUser } from "@/lib/auth/server";
import { formatScore, reviewHref, shapeSignalLab } from "@/lib/insights";
import { getSessionLecture } from "@/lib/lecture";
import { formatClock } from "@/lib/time";
import type { TimelineData } from "@/lib/types";
import DeskShell from "@/components/DeskShell";
import SignalChart from "@/components/SignalChart";
import SignalLegend from "@/components/SignalLegend";
import { ChevronRightIcon } from "@/components/icons";
import { Mark, PageHeader, btnLink, btnSecondary } from "@/components/ui";

export const metadata: Metadata = {
  title: "See the details · TraceIt",
  description: "The pen signals behind every flagged moment: pausing, slowing down, erasing and pressure over lecture time.",
  // A demo page, reached by URL only (nothing in the student app links here): kept out of search.
  robots: { index: false, follow: false },
};

/**
 * One "at a glance" number (big Bricolage figure over a small label, as on My progress). The first tile
 * is the dark one. dt stays first in the DOM; the figure is moved above it visually.
 */
function Stat({ label, value, note, testId, dark = false }: { label: string; value: string; note?: string; testId: string; dark?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-[20px] px-5 py-[18px] ${dark ? "bg-night text-white" : "border border-line bg-chrome"}`}>
      <dt className={`text-sm ${dark ? "text-night-text" : "text-ink-subtle"}`}>{label}</dt>
      <dd
        data-testid={testId}
        className={`order-first font-display text-[40px] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${
          dark ? "text-highlight" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {note ? <dd className={`font-mono text-xs tabular-nums ${dark ? "text-night-text" : "text-ink-subtle"}`}>{note}</dd> : null}
    </div>
  );
}

export default async function SignalLabPage(props: PageProps<"/insights/[sessionId]">) {
  const { sessionId } = await props.params;
  const user = await requireUser(`/insights/${encodeURIComponent(sessionId)}`);
  const session = await ownedSession(user, sessionId);
  if (!session) notFound();

  const [stored, { lecture }] = await Promise.all([getTimeline(sessionId), getSessionLecture(session.lectureId)]);
  // Same rule as the review page: never show an analysis that doesn't match the ink. Analysis is
  // deterministic and idempotent, so running it here is what opening the review would do.
  let timeline: TimelineData | null = stored && stored.analyzed && !stored.stale ? stored : null;
  if (!timeline) timeline = await analyzeSession(sessionId);
  if (!timeline) notFound();

  const data = shapeSignalLab(timeline);
  const scored = data.points.filter((p) => p.phase === "scored").length;

  return (
    <DeskShell active="growth">
      <main
        data-testid="signal-lab"
        data-session-id={sessionId}
        className="flex-1 px-[clamp(16px,4vw,64px)] pt-8 pb-14 lg:pt-12"
      >
        <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
          <PageHeader
            as="h1"
            eyebrow="See the details"
            title={
              <>
                What your pen said, every <Mark>10 seconds</Mark>
              </>
            }
            lede={
              <>
                The four clues TraceIt reads from your handwriting in{" "}
                <span className="font-bold text-ink">{lecture.title}</span>, the score they add up to, and the line a
                stretch has to cross before it gets flagged. Hover or use the arrow keys for the details; pick a spike to
                jump to that moment.
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex min-h-9 max-w-full items-center rounded-pill border border-line bg-chrome px-3.5 text-sm font-bold text-ink">
                <span className="truncate">{session.title}</span>
              </span>
              <Link href={reviewHref(sessionId, null)} className={btnSecondary}>
                Open in study mode
                <ChevronRightIcon size={16} />
              </Link>
            </div>
          </PageHeader>

          <dl className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Stat dark label="spikes flagged" value={String(data.spikeCount)} testId="signal-stat-spikes" />
            <Stat
              label="highest score"
              value={data.peak ? formatScore(data.peak.score) : "—"}
              note={data.peak ? `at ${formatClock(data.peak.startMs)}` : undefined}
              testId="signal-stat-peak"
            />
            <Stat label="baseline measured" value={`${Math.round(data.baselineMs / 1000)} s`} note="your normal" testId="signal-stat-baseline" />
            <Stat label="windows scored" value={String(scored)} note={`of ${data.points.length}`} testId="signal-stat-scored" />
          </dl>

          {data.points.length === 0 ? (
            <div
              data-testid="signal-empty"
              className="panel flex min-h-44 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
            >
              <p className="font-display text-xl font-bold text-ink">Nothing to read yet</p>
              <p className="max-w-sm text-[15px] text-pretty text-ink-muted">
                Write a few lines in this session and your pen’s signals show up here.
              </p>
            </div>
          ) : (
            <SignalChart data={data} sessionId={sessionId} sessionTitle={session.title} />
          )}

          <SignalLegend />

          <Link href="/insights/evaluation" data-testid="signal-evaluation-link" className={`${btnLink} self-start`}>
            How accurate is this? See the accuracy check
            <ChevronRightIcon size={16} />
          </Link>
        </div>
      </main>
    </DeskShell>
  );
}
