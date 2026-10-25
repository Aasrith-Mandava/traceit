import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/core";
import { currentUser } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/demoMode";
import AuthCard from "@/components/auth/AuthCard";
import SignInForm from "@/components/auth/SignInForm";
import { Mark } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in · TraceIt" };

export default async function SignInPage(props: PageProps<"/signin">) {
  const { next: rawNext } = await props.searchParams;
  const wanted = safeNext(typeof rawNext === "string" ? rawNext : undefined);
  // Never bounce back to the account pages themselves (a signed-in visit would loop).
  const next = /^\/(signin|signup)(?:[/?#]|$)/.test(wanted) ? "/app" : wanted;
  // Already signed in: straight on to where they were going.
  if (await currentUser()) redirect(next);
  const demo = isDemoMode(process.env);
  const signupHref = next === "/app" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthCard
      eyebrow="Sign in"
      title={
        <>
          Welcome <Mark>back.</Mark>
        </>
      }
      lede="Pick up your notes right where you left them."
      footer={
        demo ? null : (
          <>
            New to TraceIt?{" "}
            <Link href={signupHref} className="font-bold text-accent underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        )
      }
    >
      <SignInForm next={next} demo={demo} />
    </AuthCard>
  );
}
