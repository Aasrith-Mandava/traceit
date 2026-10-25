"use client";

// Students: type the code your teacher shared (POST /api/classes/join). The class's lectures then
// show up when you start a new note.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { btnPrimary } from "../ui";
import { errorClass, inputClass, labelClass } from "../auth/AuthCard";
import { sendJson } from "../auth/postJson";

export default function JoinClassForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setJoined("");
    const res = await sendJson<{ class: { name: string; teacherName: string }; joined: boolean }>("/api/classes/join", { code });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error);
      return;
    }
    const { class: cls, joined: isNew } = res.data;
    setCode("");
    setJoined(isNew ? `You joined ${cls.name} with ${cls.teacherName}.` : `You’re already in ${cls.name}.`);
    router.refresh();
  }

  return (
    <form data-testid="join-class-form" onSubmit={submit} className="panel flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ink">Join a class</h2>
      <p className="text-[15px] text-pretty text-ink-muted">
        Got a code from your teacher? Enter it here and their lectures show up when you start a new note.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="join-code-input" className={labelClass}>
          Class code
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="join-code-input"
            name="code"
            required
            maxLength={32}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="e.g. 7KQ2-M9XA"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono tracking-[0.12em] uppercase sm:flex-1`}
          />
          <button type="submit" className={btnPrimary} disabled={busy || code.trim() === ""} aria-busy={busy}>
            {busy ? "Joining…" : "Join class"}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" data-testid="class-error" className={errorClass}>
          {error}
        </p>
      ) : null}
      <p role="status" data-testid="join-success" className="text-sm font-semibold text-pretty text-ok-strong empty:hidden">
        {joined}
      </p>
    </form>
  );
}
