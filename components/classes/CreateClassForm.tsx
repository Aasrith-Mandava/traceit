"use client";

// Teachers: name a new class (POST /api/classes); it appears in the list below with its join code.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { btnPrimary } from "../ui";
import { errorClass, inputClass, labelClass } from "../auth/AuthCard";
import { sendJson } from "../auth/postJson";

export default function CreateClassForm({ available, disabledNote }: { available: boolean; disabledNote: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !available) return;
    setBusy(true);
    setError("");
    setCreated("");
    const res = await sendJson<{ class: { name: string; joinCode: string } }>("/api/classes", { name });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error);
      return;
    }
    setName("");
    setCreated(`${res.data.class.name} is ready. Share the code ${res.data.class.joinCode} with your students.`);
    router.refresh();
  }

  return (
    <form data-testid="create-class-form" onSubmit={submit} className="panel flex flex-col gap-3 p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold text-ink">Create a class</h2>
      {available ? null : <p className="text-[15px] text-pretty text-ink-muted">{disabledNote}</p>}
      <fieldset disabled={!available} className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 disabled:opacity-60">
        <label htmlFor="class-name" className={labelClass}>
          Class name
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="class-name"
            name="name"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Calculus I — Period 3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} sm:flex-1`}
          />
          <button type="submit" className={btnPrimary} disabled={busy || name.trim() === ""} aria-busy={busy}>
            {busy ? "Creating…" : "Create class"}
          </button>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" data-testid="class-error" className={errorClass}>
          {error}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-pretty text-ok-strong empty:hidden">
        {created}
      </p>
    </form>
  );
}
