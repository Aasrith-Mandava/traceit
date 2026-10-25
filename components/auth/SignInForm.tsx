"use client";

// Sign in with email + password (POST /api/auth/signin), then a full navigation to `next` so every
// page renders as the signed-in user. In DEMO_MODE, two buttons sign into the shared demo accounts.
import { useState, type FormEvent } from "react";
import { btnPrimary, btnSecondary } from "../ui";
import { errorClass, inputClass, labelClass } from "./AuthCard";
import { sendJson } from "./postJson";

export default function SignInForm({ next, demo }: { next: string; demo: boolean }) {
  const [busy, setBusy] = useState<null | "form" | "student" | "teacher">(null);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy("form");
    setError("");
    const res = await sendJson("/api/auth/signin", { email: form.get("email"), password: form.get("password") });
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    setError(res.error);
    setBusy(null);
  }

  async function tryDemo(as: "student" | "teacher") {
    if (busy) return;
    setBusy(as);
    setError("");
    const res = await sendJson("/api/auth/demo", { as });
    if (res.ok) {
      window.location.assign(as === "teacher" ? "/classes" : "/app");
      return;
    }
    setError(res.error);
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-5">
      {demo ? (
        <section aria-labelledby="demo-heading" className="flex flex-col gap-3 rounded-[16px] bg-accent-tint p-4 ring-1 ring-accent-line">
          <h2 id="demo-heading" className="font-display text-lg font-bold text-ink">
            Just looking around?
          </h2>
          <p className="text-[15px] text-pretty text-ink-muted">
            Step into the demo as Maya, a student, or as her teacher. No account needed.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              data-testid="try-demo-student"
              className={btnPrimary}
              disabled={busy !== null}
              aria-busy={busy === "student"}
              onClick={() => tryDemo("student")}
            >
              {busy === "student" ? "Opening the demo…" : "Try the demo"}
            </button>
            <button
              type="button"
              data-testid="try-demo-teacher"
              className={btnSecondary}
              disabled={busy !== null}
              aria-busy={busy === "teacher"}
              onClick={() => tryDemo("teacher")}
            >
              {busy === "teacher" ? "Opening…" : "Try the teacher view"}
            </button>
          </div>
        </section>
      ) : null}

      <form data-testid="signin-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-email" className={labelClass}>
            Email
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="signin-password" className={labelClass}>
            Password
          </label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
            className={inputClass}
          />
        </div>
        {error ? (
          <p role="alert" data-testid="auth-error" className={errorClass}>
            {error}
          </p>
        ) : null}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy !== null} aria-busy={busy === "form"}>
          {busy === "form" ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
