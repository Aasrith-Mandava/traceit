import type { Metadata } from "next";
import { connection } from "next/server";
import { taughtClass } from "@/lib/access";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isAiConfigured } from "@/lib/lecture";
import DeskShell from "@/components/DeskShell";
import UploadLectureForm from "@/components/UploadLectureForm";
import LiveLectureStart from "@/components/LiveLectureStart";
import { liveLectureDisabled } from "@/lib/liveLecture";
import { publicUploadMaxMb, publicUploadsEnabled, uploadsAllowed } from "@/lib/demoMode";
import { MicIcon } from "@/components/icons";
import { Reveal } from "@/components/motion/Reveal";
import { Mark } from "@/components/ui";

export const metadata: Metadata = { title: "Upload a lecture · TraceIt" };

export default async function NewLecturePage(props: PageProps<"/lectures/new">) {
  // Rendered per request: whether auto-transcribe is available depends on the server's env.
  await connection();
  const user = await requireUser("/lectures/new");
  // Teachers can add the lecture to one of their classes (?class=<id> preselects one they teach).
  const searchParams = await props.searchParams;
  const classes =
    user.role === "teacher" ? (await getDb().listTeacherClasses(user.id)).map((c) => ({ id: c.id, name: c.name })) : undefined;
  const requested = typeof searchParams.class === "string" && searchParams.class.length <= 200 ? searchParams.class : null;
  const defaultClassId = requested ? (await taughtClass(user, requested))?.id : undefined;
  return (
    <DeskShell active="upload">
      <main className="flex-1 px-4 pt-8 pb-14 sm:px-[clamp(16px,4vw,64px)] sm:pt-12">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
          <Reveal as="header" className="flex flex-col gap-3.5">
            <p className="text-xs font-extrabold tracking-[0.12em] text-accent uppercase">Upload a lecture</p>
            <h1 className="page-title text-[clamp(2.25rem,4.6vw,3.5rem)] leading-[1.04] tracking-[-0.035em]">
              Bring your own <Mark>lecture.</Mark>
            </h1>
            <p className="max-w-[620px] text-[17px] leading-relaxed text-pretty text-ink-muted">
              Drop in a recording and, if you have them, its captions. TraceIt plays it while you write, and uses the words
              to show what was being said every time your pen paused.
            </p>
          </Reveal>

          <UploadLectureForm
            aiConfigured={isAiConfigured()}
            available={uploadsAllowed(process.env)}
            publicMaxMb={publicUploadsEnabled(process.env) ? publicUploadMaxMb(process.env) : undefined}
            classes={classes}
            defaultClassId={defaultClassId}
          />

          <section aria-labelledby="live-heading" className="panel flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-breakthrough-soft text-breakthrough-strong"
              >
                <MicIcon size={20} strokeWidth={2.2} />
              </span>
              <div className="flex min-w-0 flex-col">
                <h2 id="live-heading" className="text-[21px] font-bold tracking-[-0.01em] text-ink">
                  Or catch it live
                </h2>
                <span className="text-sm text-pretty text-ink-subtle">
                  In the room with no recording? Start a live lecture: TraceIt captions the lecturer as you write, and keeps
                  the audio so you can hear any part again.
                </span>
              </div>
            </div>
            <LiveLectureStart available={!liveLectureDisabled(process.env)} />
          </section>
        </div>
      </main>
    </DeskShell>
  );
}
