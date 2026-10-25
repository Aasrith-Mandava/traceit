import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { CLASS_DEMO_MESSAGE } from "@/lib/classes";
import { getDb } from "@/lib/db";
import { isDemoMode } from "@/lib/demoMode";
import type { TeacherClass } from "@/lib/types";
import CreateClassForm from "@/components/classes/CreateClassForm";
import JoinClassForm from "@/components/classes/JoinClassForm";
import DeskShell from "@/components/DeskShell";
import { ClassIcon } from "@/components/icons";
import { Mark, PageHeader, SectionTitle, btnLink } from "@/components/ui";

export const metadata: Metadata = { title: "Classes · TraceIt" };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export default async function ClassesPage() {
  const user = await requireUser("/classes");
  const db = getDb();
  const teacher = user.role === "teacher";

  return (
    <DeskShell active="classes">
      <main className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          {teacher ? (
            <TeacherClasses classes={await db.listTeacherClasses(user.id)} demo={isDemoMode(process.env)} />
          ) : (
            <StudentClasses classes={await db.listStudentClasses(user.id)} />
          )}
        </div>
      </main>
    </DeskShell>
  );
}

function TeacherClasses({ classes, demo }: { classes: TeacherClass[]; demo: boolean }) {
  return (
    <>
      <PageHeader
        as="h1"
        eyebrow="For teachers"
        title={
          <>
            My <Mark>classes.</Mark>
          </>
        }
        lede="Create a class, share its code with your students, and add lectures to it. Class insights count only the students who joined."
      />
      <CreateClassForm available={!demo} disabledNote={CLASS_DEMO_MESSAGE} />
      <section aria-labelledby="classes-heading" className="flex flex-col gap-3">
        <SectionTitle id="classes-heading">Your classes</SectionTitle>
        {classes.length === 0 ? (
          <p className="panel px-5 py-6 text-[15px] text-ink-muted">No classes yet. Create your first one above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {classes.map((c) => (
              <li key={c.id} data-testid="class-card" data-class-id={c.id} className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                    <ClassIcon size={20} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="truncate font-display text-lg font-bold text-ink">{c.name}</h3>
                    <p className="text-sm text-ink-muted">
                      <span data-testid="class-roster-count" data-count={c.studentCount}>
                        {plural(c.studentCount, "student")}
                      </span>{" "}
                      · {plural(c.lectureCount, "lecture")}
                    </p>
                    <p className="text-sm text-ink-muted">
                      Code{" "}
                      <span data-testid="join-code" className="rounded-[8px] bg-highlight px-2 py-0.5 font-mono text-[15px] font-bold tracking-[0.12em] text-on-highlight">
                        {c.joinCode}
                      </span>
                    </p>
                  </div>
                </div>
                <Link href={`/classes/${encodeURIComponent(c.id)}`} className={`${btnLink} self-start sm:self-center`}>
                  Open class<span className="sr-only"> {c.name}</span> →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StudentClasses({ classes }: { classes: Array<{ id: string; name: string; teacherName: string }> }) {
  return (
    <>
      <PageHeader
        as="h1"
        eyebrow="Classes"
        title={
          <>
            Join your <Mark>class.</Mark>
          </>
        }
        lede="Your teacher’s lectures show up when you start a new note. Your notes stay yours: teachers only ever see anonymous patterns from the whole class."
      />
      <JoinClassForm />
      <section aria-labelledby="joined-heading" className="flex flex-col gap-3">
        <SectionTitle id="joined-heading">Your classes</SectionTitle>
        {classes.length === 0 ? (
          <p className="panel px-5 py-6 text-[15px] text-ink-muted">You haven’t joined a class yet.</p>
        ) : (
          <ul className="panel divide-y divide-line overflow-hidden">
            {classes.map((c) => (
              <li key={c.id} data-testid="student-class" className="flex items-center gap-3 px-5 py-4">
                <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <ClassIcon size={18} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-bold text-ink">{c.name}</span>
                  <span className="text-sm text-ink-muted">with {c.teacherName}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
