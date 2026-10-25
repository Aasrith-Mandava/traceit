"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lecture } from "@/lib/types";
import { formatClock } from "./LecturePlayer";
import { ChevronRightIcon, PlusIcon, UploadIcon } from "./icons";
import { btnPrimary } from "./ui";

/** "06:00 · audio + captions" / "00:40 · video · no captions". */
function lectureMeta(l: Lecture): string {
  const kind = l.mediaType === "video" ? "video" : "audio";
  return l.wordCount > 0 ? `${formatClock(l.durationMs)} · ${kind} + captions` : `${formatClock(l.durationMs)} · ${kind} · no captions`;
}

/**
 * The picker's groups, in order: "Sample" (the bundled demo lecture), "My lectures" (the user's own
 * personal uploads) and one per class (lectures added to a class, by its name). Empty groups are left out.
 */
function groupLectures(lectures: Lecture[]): Array<{ label: string; lectures: Lecture[] }> {
  const sample: Lecture[] = [];
  const mine: Lecture[] = [];
  const byClass = new Map<string, { label: string; lectures: Lecture[] }>();
  for (const l of lectures) {
    if (l.transcriptSource === "demo") sample.push(l);
    else if (l.classId) {
      const group = byClass.get(l.classId) ?? { label: l.className ?? "Class", lectures: [] };
      group.lectures.push(l);
      byClass.set(l.classId, group);
    } else mine.push(l);
  }
  return [
    { label: "Sample", lectures: sample },
    { label: "My lectures", lectures: mine },
    ...byClass.values(),
  ].filter((g) => g.lectures.length > 0);
}

interface Props {
  lectures: Lecture[];
  /** Pre-selected lecture (the demo lecture unless the page says otherwise). */
  defaultLectureId: string;
}

/**
 * The "Study a recorded lecture" card's body: lecture picker (with a link to upload another), its
 * length and captions, and "Start writing". Creates a session against the chosen lecture and opens it. Grows to fill its
 * card so the button sits at the bottom, level with the live card's.
 */
export default function NewSessionButton({ lectures, defaultLectureId }: Props) {
  const router = useRouter();
  const selectId = useId();
  const [lectureId, setLectureId] = useState(
    lectures.some((l) => l.id === defaultLectureId) ? defaultLectureId : (lectures[0]?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = lectures.find((l) => l.id === lectureId);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lectureId ? { lectureId } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { session } = (await res.json()) as { session: { id: string } };
      router.push(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t open a fresh page");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="kicker tracking-[0.08em] text-ink-subtle">
          Pick a lecture
        </label>
        <div className="relative">
          <select
            id={selectId}
            data-testid="lecture-picker"
            value={lectureId}
            onChange={(e) => setLectureId(e.target.value)}
            className="min-h-12 w-full appearance-none truncate rounded-md border-[1.5px] border-line bg-chrome-hover py-2 pr-10 pl-3.5 text-base font-semibold text-ink transition-colors hover:border-accent-line"
          >
            {groupLectures(lectures).map((g, i) => (
              <optgroup key={`${i}-${g.label}`} label={g.label}>
                {g.lectures.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronRightIcon
            size={18}
            strokeWidth={2.2}
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 rotate-90 text-ink-subtle"
          />
        </div>
        <p data-testid="lecture-meta" className="font-mono text-[13px] text-ink-subtle">
          {selected ? lectureMeta(selected) : "No lectures yet. Upload one first"}
        </p>
        {/* Any recording can be studied: uploads join this list (and arrive pre-selected). */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href="/lectures/new"
            data-testid="picker-upload"
            className="press inline-flex min-h-11 items-center gap-2 rounded-md border-[1.5px] border-dashed border-accent-line bg-accent-tint px-3.5 text-sm font-bold text-accent-strong hover:border-accent hover:bg-accent-soft"
          >
            <UploadIcon size={16} />
            Upload another lecture
          </Link>
          {lectures.length <= 1 ? (
            <span className="text-[13px] text-ink-subtle">Audio or video, with captions if you have them.</span>
          ) : null}
        </div>
      </div>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        data-testid="new-session"
        onClick={create}
        disabled={busy || !lectureId}
        aria-busy={busy}
        className={`${btnPrimary} mt-auto min-h-[50px] text-base`}
      >
        <PlusIcon size={18} strokeWidth={2.4} />
        {busy ? "Opening a fresh page…" : "Start writing"}
      </button>
    </div>
  );
}
