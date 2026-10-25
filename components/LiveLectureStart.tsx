"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { btnSecondary } from "./ui";

/** Shown (with the form disabled) when this copy of TraceIt can't record: DEMO_MODE. */
const LIVE_UNAVAILABLE_NOTE = "Live capture needs a self-hosted copy of TraceIt.";

/**
 * The "In the lecture hall" card's body: name the class, then Start live lecture. Creates a lecture with no
 * recording plus a session on it and opens the capture screen, where the microphone is asked for
 * only when the student presses Start there. Shown but disabled in DEMO_MODE. Grows to fill its
 * card so the button sits at the bottom.
 */
export default function LiveLectureStart({ available }: { available: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const noteId = useId();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!available || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lectures/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title.trim() ? { title: title.trim() } : {}),
      });
      const body = (await res.json().catch(() => ({}))) as { session?: { id: string }; error?: string };
      if (!res.ok || !body.session) throw new Error(body.error || `HTTP ${res.status}`);
      router.push(`/session/${body.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t start the live lecture");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} data-testid="live-lecture-form" aria-label="Live lecture" className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={titleId} className="kicker tracking-[0.08em] text-ink-subtle">
          Name this class
        </label>
        <input
          id={titleId}
          data-testid="live-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="e.g. Organic Chem: Week 3"
          disabled={!available}
          aria-describedby={noteId}
          className="min-h-12 w-full rounded-md border-[1.5px] border-line bg-chrome-hover px-3.5 text-base text-ink transition-colors placeholder:text-ink-subtle hover:border-accent-line disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
        />
        <p id={noteId} data-testid="live-lecture-note" className="text-[13px] text-pretty text-ink-subtle">
          {available
            ? "TraceIt listens through your mic and captions the lecturer while you write. The mic is used only in live mode, after you press Start on the next screen."
            : LIVE_UNAVAILABLE_NOTE}
        </p>
      </div>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
      <button
        type="submit"
        data-testid="live-start"
        disabled={!available || busy}
        aria-busy={busy}
        className={`${btnSecondary} mt-auto min-h-[50px] border-ink text-base enabled:hover:border-accent`}
      >
        <span aria-hidden="true" className="size-[9px] shrink-0 rounded-pill bg-breakthrough" />
        {busy ? "Starting…" : "Start live lecture"}
      </button>
    </form>
  );
}
