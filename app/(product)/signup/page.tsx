import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PASSWORD_MIN, SIGNUP_DEMO_MESSAGE, localDataToAdopt } from "@/lib/auth/accounts";
import { safeNext } from "@/lib/auth/core";
import { currentUser } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/demoMode";
import AuthCard from "@/components/auth/AuthCard";
import SignUpForm from "@/components/auth/SignUpForm";
import { Mark, btnPrimary } from "@/components/ui";

export const metadata: Metadata = { title: "Create an account · TraceIt" };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default async function SignUpPage(props: PageProps<"/signup">) {
  const { next: rawNext } = await props.searchParams;
  const wanted = safeNext(typeof rawNext === "string" ? rawNext : undefined);
  // Never bounce back to the account pages themselves (a signed-in visit would loop).
  const next = /^\/(signin|signup)(?:[/?#]|$)/.test(wanted) ? "/app" : wanted;
  if (await currentUser()) redirect(next);
  const demo = isDemoMode(process.env);
  const signinHref = next === "/app" ? "/signin" : `/signin?next=${encodeURIComponent(next)}`;
  const adopt = demo ? null : await localDataToAdopt();

  return (
    <AuthCard
      eyebrow="Create an account"
      title={
        <>
          Your notes, <Mark>your account.</Mark>
        </>
      }
      lede="Keep your notes and your progress in one place, and join your class with a code."
      footer={
        <>
          Already have an account?{" "}
          <Link href={signinHref} className="font-bold text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {demo ? (
        <div className="flex flex-col gap-4">
          <p role="status" data-testid="signup-disabled" className="rounded-[14px] bg-accent-tint px-4 py-3 text-[15px] text-pretty text-ink-muted ring-1 ring-accent-line">
            {SIGNUP_DEMO_MESSAGE} On this demo, try it as Maya or as her teacher instead.
          </p>
          <Link href={signinHref} className={`${btnPrimary} w-full`}>
            Try the demo
          </Link>
        </div>
      ) : (
        <>
          {adopt && (adopt.sessions > 0 || adopt.lectures > 0) ? (
            <p
              data-testid="adopt-notice"
              className="rounded-[14px] bg-ok-soft px-4 py-3 text-[15px] text-pretty text-ok-strong"
            >
              <span className="font-bold">Your notes on this device will move into this account</span> (
              {[adopt.sessions > 0 ? plural(adopt.sessions, "note") : "", adopt.lectures > 0 ? plural(adopt.lectures, "lecture") : ""]
                .filter(Boolean)
                .join(" and ")}
              ).
            </p>
          ) : null}
          <SignUpForm next={next} passwordMin={PASSWORD_MIN} />
        </>
      )}
    </AuthCard>
  );
}
