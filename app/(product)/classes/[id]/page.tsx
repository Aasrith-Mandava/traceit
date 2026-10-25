import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { taughtClass } from "@/lib/access";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { formatClock } from "@/lib/time";
import CopyButton from "@/components/classes/CopyButton";
import DeskShell from "@/components/DeskShell";
import { ClassIcon, UploadIcon } from "@/components/icons";
import { Mark, PageHeader, SectionTitle, btnLink, btnPrimary } from "@/components/ui";

export const metadata: Metadata = { title: "Class · TraceIt" };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** This site's origin as the browser sees it (behind Railway's proxy too), for the join link. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ClassPage(props: PageProps<"/classes/[id]">) {
  const { id } = await props.params;
  const teacher = await requireTeacher(`/classes/${encodeURIComponent(id)}`);
  const cls = await taughtClass(teacher, id);
  if (!cls) notFound();
  const db = getDb();
  const [studentIds, visible, origin] = await Promise.all([
    db.listClassStudentIds(cls.id),
    db.listVisibleLectures(teacher.id),
    siteOrigin(),
  ]);
  const lectures = visible.filter((l) => l.classId === cls.id);
  const joinPath = `/join/${encodeURIComponent(cls.joinCode)}`;
  const joinUrl = `${origin}${joinPath}`;

  return (
    <DeskShell active="classes">
      <main className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          <Link href="/classes" className={`${btnLink} -ml-3 self-start`}>
            ‹ My classes
          </Link>
          <PageHeader
            as="h1"
            eyebrow="Class"
            title={<Mark>{cls.name}</Mark>}
            lede={
              <>
                <span data-testid="class-roster-count" data-count={studentIds.length} className="font-bold text-ink">
                  {plural(studentIds.length, "student")}
                </span>{" "}
                joined so far. Class insights count only them, and never show a name.
              </>
            }
          />

          <section aria-labelledby="invite-heading" className="panel flex flex-col gap-4 p-5 sm:p-6">
            <h2 id="invite-heading" className="font-display text-xl font-bold text-ink">
              Invite your students
            </h2>
            <div className="flex flex-col gap-1.5">
              <span className="kicker tracking-[0.08em] text-ink-subtle">Class code</span>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  data-testid="join-code"
                  className="rounded-[10px] bg-highlight px-3 py-1.5 font-mono text-[26px] font-extrabold tracking-[0.16em] text-on-highlight"
                >
                  {cls.joinCode}
                </span>
                <CopyButton text={cls.joinCode} label="Copy code" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="kicker tracking-[0.08em] text-ink-subtle">Or share this link</span>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <code data-testid="join-link" className="min-w-0 rounded-md bg-chrome-hover px-3 py-2.5 text-sm break-all text-ink ring-1 ring-line sm:flex-1">
                  {joinUrl}
                </code>
                <CopyButton text={joinUrl} label="Copy link" />
              </div>
            </div>
          </section>

          <section aria-labelledby="lectures-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle id="lectures-heading">Lectures</SectionTitle>
              <Link href={`/lectures/new?class=${encodeURIComponent(cls.id)}`} data-testid="class-upload" className={btnPrimary}>
                <UploadIcon size={18} />
                Upload a lecture to this class
              </Link>
            </div>
            {lectures.length === 0 ? (
              <p className="panel px-5 py-6 text-[15px] text-pretty text-ink-muted">
                No lectures in this class yet. Upload one and your students can take notes on it.
              </p>
            ) : (
              <ul className="panel divide-y divide-line overflow-hidden">
                {lectures.map((l) => (
                  <li key={l.id} data-testid="class-lecture" data-lecture-id={l.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                      <ClassIcon size={18} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-bold text-ink">{l.title}</span>
                      <span className="text-sm text-ink-muted tabular-nums">
                        {l.durationMs > 0 ? formatClock(l.durationMs) : "Live"}
                      </span>
                    </div>
                    <Link href={`/teacher/${encodeURIComponent(l.id)}`} data-testid="class-insights-link" className={btnLink}>
                      Class insights<span className="sr-only"> for {l.title}</span> →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </DeskShell>
  );
}
