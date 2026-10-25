"use client";

// The one button on /join/<code> that actually enrolls (a POST; opening the link never does).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary } from "../ui";
import { errorClass } from "../auth/AuthCard";
import { sendJson } from "../auth/postJson";

export default function JoinConfirmButton({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function join() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await sendJson("/api/classes/join", { code });
    if (res.ok) {
      router.push("/classes");
      router.refresh();
      return;
    }
    setError(res.error);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        data-testid="join-class-button"
        onClick={join}
        disabled={busy}
        aria-busy={busy}
        className={`${btnPrimary} w-full`}
      >
        {busy ? "Joining…" : `Join ${name}`}
      </button>
      {error ? (
        <p role="alert" data-testid="class-error" className={errorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
