"use client";

// Change your display name (PATCH /api/account). Shared demo accounts see it read-only.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { btnPrimary } from "../ui";
import { errorClass, inputClass, labelClass } from "./AuthCard";
import { sendJson } from "./postJson";

export default function AccountNameForm({ name, editable }: { name: string; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !editable) return;
    setBusy(true);
    setError("");
    setSaved(false);
    const res = await sendJson<{ user: { name: string } }>("/api/account", { name: value }, "PATCH");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data) setValue(res.data.user.name);
    setSaved(true);
    router.refresh();
  }

  return (
    <form data-testid="account-form" onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-name" className={labelClass}>
          Name
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="account-name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            value={value}
            readOnly={!editable}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            className={`${inputClass} sm:flex-1`}
          />
          {editable ? (
            <button type="submit" className={btnPrimary} disabled={busy || value.trim() === ""} aria-busy={busy}>
              {busy ? "Saving…" : "Save name"}
            </button>
          ) : null}
        </div>
        {editable ? null : <span className="text-[13px] text-ink-subtle">The demo account’s name can’t be changed.</span>}
      </div>
      {error ? (
        <p role="alert" data-testid="auth-error" className={errorClass}>
          {error}
        </p>
      ) : null}
      <p role="status" className="min-h-5 text-sm font-semibold text-ok-strong">
        {saved ? "Saved." : ""}
      </p>
    </form>
  );
}
