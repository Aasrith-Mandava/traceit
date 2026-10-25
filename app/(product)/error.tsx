"use client";

import Link from "next/link";
import { StatusScreen } from "@/components/StatusScreen";
import { Mark, btnPrimary, btnSecondary } from "@/components/ui";

// An unexpected error while rendering a page of the app: say so plainly and offer a retry.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusScreen
      eyebrow="Something went wrong"
      scribble="oops"
      title={
        <>
          Well, that got <Mark>messy.</Mark>
        </>
      }
      lede="Nothing you wrote is lost: your ink saves as you go. Try again, or head back to your notes."
      actions={
        <>
          <button type="button" onClick={reset} className={btnPrimary}>
            Try again
          </button>
          <Link href="/app" className={btnSecondary}>
            Back to my notes
          </Link>
        </>
      }
    />
  );
}
