import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/server";
import { classForCode } from "@/lib/classes";
import { getDb } from "@/lib/db";
import AuthCard from "@/components/auth/AuthCard";
import JoinConfirmButton from "@/components/classes/JoinConfirmButton";
import { Mark, btnPrimary, btnSecondary } from "@/components/ui";

export const metadata: Metadata = { title: "Join a class · TraceIt" };

// A teacher's shared join link. Opening it never enrolls anyone: the student confirms with a POST.
export default async function JoinPage(props: PageProps<"/join/[code]">) {
  const { code } = await props.params;
  const user = await requireUser(`/join/${encodeURIComponent(code)}`);
  const db = getDb();
  const cls = await classForCode(db, code);

  if (!cls) {
    return (
      <AuthCard
        eyebrow="Join a class"
        title={
          <>
            That code doesn’t match a <Mark>class.</Mark>
          </>
        }
        lede="Check the link or the code with your teacher. You can also type the code on the Classes page."
      >
        <Link href="/classes" className={`${btnPrimary} w-full`}>
          Go to Classes
        </Link>
      </AuthCard>
    );
  }

  if (user.role === "teacher") {
    const mine = cls.teacherId === user.id;
    return (
      <AuthCard
        eyebrow="Join a class"
        title={<Mark>{cls.name}</Mark>}
        lede={
          mine
            ? "This is your class. Share this link with your students so they can join."
            : "Teacher accounts can’t join classes. Sign in with a student account to join this one."
        }
      >
        <Link href={mine ? `/classes/${encodeURIComponent(cls.id)}` : "/classes"} className={`${btnPrimary} w-full`}>
          {mine ? "Open the class" : "Back to my classes"}
        </Link>
      </AuthCard>
    );
  }

  const already = (await db.listStudentClasses(user.id)).some((c) => c.id === cls.id);
  return (
    <AuthCard
      eyebrow="Join a class"
      title={
        <>
          Join <Mark>{cls.name}?</Mark>
        </>
      }
      lede={
        already ? (
          <>You’re already in this class with {cls.teacherName}.</>
        ) : (
          <>
            Taught by <span className="font-bold text-ink">{cls.teacherName}</span>. Their lectures will show up when you
            start a new note. Your notes stay yours: your teacher only sees anonymous patterns from the whole class.
          </>
        )
      }
    >
      {already ? (
        <Link href="/app" className={`${btnPrimary} w-full`}>
          Go to my notes
        </Link>
      ) : (
        <div className="flex flex-col gap-3">
          <JoinConfirmButton code={cls.joinCode} name={cls.name} />
          <Link href="/app" className={`${btnSecondary} w-full`}>
            Not now
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
