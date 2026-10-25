"use client";

// Create an account (POST /api/auth/signup): name, email, password and Student / Teacher. Then a
// full navigation to `next` (a new teacher with nowhere particular to go lands on My classes).
import { useState, type FormEvent } from "react";
import { btnPrimary } from "../ui";
import { errorClass, inputClass, labelClass } from "./AuthCard";
import { sendJson } from "./postJson";

const ROLES = [
  { value: "student", label: "Student", hint: "Take notes, find your fuzzy spots, join your class." },
  { value: "teacher", label: "Teacher", hint: "Create classes and see where the room got lost." },
] as const;

export default function SignUpForm({ next, passwordMin }: { next: string; passwordMin: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"student" | "teacher">("student");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await sendJson("/api/auth/signup", {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      role,
    });
    if (res.ok) {
      window.location.assign(role === "teacher" && next === "/app" ? "/classes" : next);
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <form data-testid="signup-form" onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className={`${labelClass} mb-1.5`}>I’m a…</legend>
        <div className="grid grid-cols-2 gap-2.5">
          {ROLES.map((r) => (
            <label
              key={r.value}
              className={`press flex min-h-11 cursor-pointer flex-col gap-1 rounded-[14px] border-[1.5px] p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                role === r.value ? "border-accent bg-accent-soft" : "border-line bg-chrome hover:border-accent-line"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  data-testid={`role-${r.value}`}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                <span className="text-[16px] font-bold text-ink">{r.label}</span>
              </span>
              <span className="text-[13px] leading-snug text-pretty text-ink-muted">{r.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-name" className={labelClass}>
          Your name
        </label>
        <input id="signup-name" name="name" autoComplete="name" required maxLength={80} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className={labelClass}>
          Email
        </label>
        <input
          id="signup-email"
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
        <label htmlFor="signup-password" className={labelClass}>
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={passwordMin}
          maxLength={200}
          aria-describedby="signup-password-hint"
          className={inputClass}
        />
        <span id="signup-password-hint" className="text-[13px] text-ink-subtle">
          At least {passwordMin} characters.
        </span>
      </div>
      {error ? (
        <p role="alert" data-testid="auth-error" className={errorClass}>
          {error}
        </p>
      ) : null}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={busy} aria-busy={busy}>
        {busy ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
