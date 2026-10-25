"use client";

// Class insights for a lecture: "Find the minute your class lost the thread." — the class heatmap,
// the stretches worth re-teaching (with what the lecturer said and a lecture replay of each), and the
// privacy promise. Everything shown is anonymous and k-anonymous (lib/teacher); this component only
// lays it out, inside the desk shell (the page wraps it in <DeskShell active="class">).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ClassReport, ReteachMoment } from "@/lib/teacher";
import { formatClock } from "@/lib/time";
import TeacherHeatmap from "./TeacherHeatmap";
import { ClassIcon, PlayIcon, StopIcon } from "./icons";
import { Mark, PageHeader, btnPrimary, btnSecondary } from "./ui";

interface Playing {
  startMs: number;
  endMs: number;
}

const range = (r: Playing) => `${formatClock(r.startMs)}–${formatClock(r.endMs)}`;

function ShieldIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** Plays one stretch of the lecture media and stops at its end. */
function useStretchPlayer(mediaRef: React.RefObject<HTMLMediaElement | null>) {
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playingRef = useRef<Playing | null>(null);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onTime = () => {
      const p = playingRef.current;
      if (p && el.currentTime * 1000 >= p.endMs) el.pause();
    };
    const onPause = () => {
      playingRef.current = null;
      setPlaying(null);
    };
    const onError = () => {
      playingRef.current = null;
      setPlaying(null);
      setError("Couldn’t load the lecture recording.");
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("error", onError);
    };
  }, [mediaRef]);

  const play = useCallback(
    async (stretch: Playing) => {
      const el = mediaRef.current;
      if (!el) return;
      setError(null);
      playingRef.current = stretch;
      setPlaying(stretch);
      el.currentTime = stretch.startMs / 1000;
      try {
        await el.play();
      } catch (err) {
        // A newer play() or a pause() interrupting this one is not a failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
        playingRef.current = null;
        setPlaying(null);
        setError("Couldn’t play the lecture — try again.");
      }
    },
    [mediaRef],
  );
  const stop = useCallback(() => mediaRef.current?.pause(), [mediaRef]);
  return { playing, error, play, stop };
}

function MomentCard({
  moment,
  playing,
  onPlay,
  onStop,
}: {
  moment: ReteachMoment;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  const timeId = `moment-${moment.rank}-time`;
  return (
    <li
      data-testid="reteach-moment"
      data-rank={moment.rank}
      data-start-ms={moment.startMs}
      data-end-ms={moment.endMs}
      className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5 sm:p-6"
    >
      {/* Same number as the marker above the heatmap. */}
      <span
        aria-hidden="true"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-night font-display text-xl font-extrabold text-highlight tabular-nums"
      >
        {moment.rank}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={timeId} className="font-mono text-[17px] font-medium tracking-normal text-ink tabular-nums">
            <span className="sr-only">Moment {moment.rank}: </span>
            {range(moment)}
          </h3>
          <span data-testid="moment-students" data-count={moment.students ?? ""} className="text-sm text-ink-muted tabular-nums">
            {moment.students === null ? (
              <>
                <span className="font-bold text-ink">Fewer than 3 students</span> hesitated or erased
              </>
            ) : (
              <>
                <span className="font-bold text-ink">{moment.studentsLabel}</span> hesitated or erased
              </>
            )}
            {moment.erased > 0 ? ` · ${moment.erased} erased strokes` : null}
          </span>
        </div>
        {moment.excerpt ? (
          <div className="flex flex-col gap-1.5 rounded-md border-l-[3px] border-accent-line bg-accent-tint py-2.5 pr-4 pl-3.5">
            <span className="kicker text-[11px]">What you were saying</span>
            <blockquote data-testid="moment-excerpt" className="text-[15px] leading-relaxed text-pretty text-ink">
              “{moment.excerpt}”
            </blockquote>
          </div>
        ) : (
          <p className="text-sm text-ink-subtle">No captions for this stretch — hit play to hear what was said.</p>
        )}
      </div>
      <button
        type="button"
        data-testid="play-moment"
        data-state={playing ? "playing" : "idle"}
        aria-describedby={timeId}
        onClick={playing ? onStop : onPlay}
        className={`${playing ? btnPrimary : btnSecondary} shrink-0 self-start`}
      >
        {playing ? <StopIcon size={16} /> : <PlayIcon size={16} />}
        {playing ? "Stop" : "Play this part"}
      </button>
    </li>
  );
}

/** One "at a glance" number. The first tile is the dark one, as on My progress. */
function GlanceTile({
  value,
  label,
  dark = false,
  testId,
  count,
}: {
  value: number;
  label: string;
  dark?: boolean;
  testId?: string;
  count?: number;
}) {
  return (
    <div
      data-testid={testId}
      data-count={count}
      className={`flex flex-col gap-1 rounded-[20px] px-5 py-[18px] ${dark ? "bg-night text-white" : "border border-line bg-chrome"}`}
    >
      <span
        className={`font-display text-[40px] leading-none font-extrabold tracking-[-0.02em] tabular-nums ${
          dark ? "text-highlight" : "text-ink"
        }`}
      >
        {value}
      </span>{" "}
      <span className={`text-sm ${dark ? "text-night-text" : "text-ink-subtle"}`}>{label}</span>
    </div>
  );
}

export default function TeacherView({
  report,
  mediaSrc,
  classInfo,
}: {
  report: ClassReport;
  mediaSrc: string;
  /** The class the lecture belongs to (the report counts only its enrolled students). */
  classInfo?: { id: string; name: string };
}) {
  const classHref = classInfo ? `/classes/${encodeURIComponent(classInfo.id)}` : "/classes";
  const { lecture, view } = report;
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const { playing, error, play, stop } = useStretchPlayer(mediaRef);
  const reteachCount = view.status === "ready" ? Math.min(3, view.moments.length) : 0;

  return (
    <main
      data-testid="teacher-view"
      data-status={view.status}
      className="flex-1 px-[clamp(16px,4vw,64px)] pt-8 pb-14 lg:pt-12"
    >
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
        <PageHeader
          as="h1"
          eyebrow="Class insights"
          title={
            <>
              Find the minute your class <Mark>lost the thread.</Mark>
            </>
          }
          lede={
            <>
              How {classInfo ? <span className="font-bold text-ink">{classInfo.name}</span> : "the room"} wrote along with{" "}
              <span className="font-bold text-ink">{lecture.title}</span>: where everyone hesitated and erased, and the
              stretches worth teaching again. Only students enrolled in the class are counted.
            </>
          }
        >
          <p
            data-testid="equity-line"
            className="flex max-w-2xl items-start gap-3 rounded-[16px] border border-line bg-chrome px-4 py-3 text-[15px] text-pretty text-ink-muted shadow-hairline"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok-strong">
              <ShieldIcon size={18} />
            </span>
            <span className="self-center">
              <span className="font-bold text-ink">Patterns from the whole room, never a name or a face.</span> Only how
              everyone’s pen hesitated and erased, pooled per 30 seconds. A group smaller than 3 students is never counted.
            </span>
          </p>
        </PageHeader>

        {view.status === "empty" ? (
          <section
            data-testid="teacher-empty"
            className="panel flex min-h-48 flex-col items-center justify-center gap-2 px-6 py-12 text-center"
          >
            <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
              <ClassIcon size={24} />
            </span>
            <p className="mt-1 font-display text-xl font-bold text-ink">Nobody has written along yet</p>
            <p className="max-w-sm text-[15px] text-pretty text-ink-muted">
              Once students in your class take notes on this lecture, you’ll see the exact minutes they hesitated and
              erased.
            </p>
            <Link href={classHref} className={`${btnSecondary} mt-3`}>
              {classInfo ? `Back to ${classInfo.name}` : "Back to my classes"}
            </Link>
          </section>
        ) : null}

        {view.status === "too-few" ? (
          <section data-testid="teacher-privacy" className="panel flex flex-col gap-2.5 px-5 py-6 sm:px-6">
            <p className="inline-flex items-center gap-3 font-display text-lg font-bold text-ink">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok-strong">
                <ShieldIcon size={18} />
              </span>
              Fewer than 3 students have written along so far
            </p>
            <p className="max-w-xl text-[15px] text-pretty text-ink-muted">
              To keep everyone anonymous, class insights appear once at least 3 students have taken notes on this lecture
              — so no pattern can be traced back to one person.
            </p>
          </section>
        ) : null}

        {view.status === "ready" ? (
          <>
            <section aria-label="At a glance" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
              <GlanceTile
                dark
                value={view.classSize}
                label="students’ notes on this lecture"
                testId="class-size"
                count={view.classSize}
              />
              <GlanceTile value={view.moments.length} label={view.moments.length === 1 ? "moment worth re-teaching" : "moments worth re-teaching"} />
              <GlanceTile value={view.buckets.reduce((n, b) => n + b.erased, 0)} label="strokes erased across the class" />
            </section>

            <TeacherHeatmap
              buckets={view.buckets}
              moments={view.moments}
              source={report.source}
              timescale={report.timescale}
              onPlayFrom={(startMs, endMs) => void play({ startMs, endMs })}
            />

            <section aria-labelledby="reteach-heading" className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                <h2 id="reteach-heading" className="text-[26px] leading-tight font-bold text-ink">
                  {reteachCount} {reteachCount === 1 ? "moment" : "moments"} worth re-teaching
                </h2>
                <p className="text-sm text-ink-subtle">Where the most students hesitated or erased</p>
              </div>
              {view.moments.length === 0 ? (
                <p data-testid="reteach-none" className="panel px-5 py-5 text-[15px] text-pretty text-ink-muted">
                  No stretch stood out — the room barely hesitated or erased during this lecture.
                </p>
              ) : (
                <ol data-testid="reteach-list" className="flex flex-col gap-3.5">
                  {view.moments.map((m) => (
                    <MomentCard
                      key={m.rank}
                      moment={m}
                      playing={playing?.startMs === m.startMs && playing.endMs === m.endMs}
                      onPlay={() => void play({ startMs: m.startMs, endMs: m.endMs })}
                      onStop={stop}
                    />
                  ))}
                </ol>
              )}
            </section>

            <div className="flex flex-col gap-2">
              {lecture.mediaType === "video" ? (
                <video
                  ref={mediaRef as React.RefObject<HTMLVideoElement | null>}
                  src={mediaSrc}
                  preload="metadata"
                  playsInline
                  aria-label={`Lecture video: ${lecture.title}`}
                  data-testid="teacher-media"
                  className={`aspect-video w-full max-w-md rounded-lg bg-night object-contain shadow-page ${playing ? "" : "hidden"}`}
                />
              ) : (
                <audio ref={mediaRef as React.RefObject<HTMLAudioElement | null>} src={mediaSrc} preload="metadata" data-testid="teacher-media" />
              )}
              <p role="status" data-testid="teacher-playing" className="min-h-5 text-sm text-ink-muted tabular-nums">
                {playing ? `Playing the lecture, ${range(playing)}` : ""}
              </p>
              {error ? (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
