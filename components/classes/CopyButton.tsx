"use client";

// Copies a join link / code to the clipboard, with a short "Copied" confirmation.
import { useState } from "react";
import { btnSecondary } from "../ui";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" onClick={copy} className={btnSecondary} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy it" : label}
    </button>
  );
}
