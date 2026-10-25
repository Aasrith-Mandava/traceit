import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/server";
import AccountNameForm from "@/components/auth/AccountNameForm";
import DeskShell from "@/components/DeskShell";
import { Mark, PageHeader, btnSecondary } from "@/components/ui";

export const metadata: Metadata = { title: "Your account · TraceIt" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const role = user.role === "teacher" ? "Teacher" : "Student";

  return (
    <DeskShell active="account">
      <main className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12">
        <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8">
          <PageHeader
            as="h1"
            eyebrow="Your account"
            title={
              <>
                Hi, <Mark>{user.name}.</Mark>
              </>
            }
            lede={user.guest ? "You’re trying the shared demo account. Anyone can sign in to it, so keep nothing private here." : "Your name, email and role on TraceIt."}
          />

          <section aria-labelledby="profile-heading" className="panel flex flex-col gap-5 p-5 sm:p-6">
            <h2 id="profile-heading" className="font-display text-xl font-bold text-ink">
              Profile
            </h2>
            <AccountNameForm name={user.name} editable={!user.guest} />
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="kicker tracking-[0.08em] text-ink-subtle">Email</dt>
                <dd data-testid="account-email" className="truncate text-base font-semibold text-ink">
                  {user.email}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="kicker tracking-[0.08em] text-ink-subtle">Role</dt>
                <dd data-testid="account-role" className="text-base font-semibold text-ink">
                  {role}
                  {user.guest ? " (demo)" : ""}
                </dd>
              </div>
            </dl>
          </section>

          {/* A plain form POST: the route clears the cookie and answers 303 → /signin. Works without JS. */}
          <form method="post" action="/api/auth/signout" className="flex">
            <button type="submit" data-testid="signout" className={btnSecondary}>
              Sign out
            </button>
          </form>
        </div>
      </main>
    </DeskShell>
  );
}
