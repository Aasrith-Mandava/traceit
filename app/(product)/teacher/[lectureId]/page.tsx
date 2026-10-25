import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { taughtLecture } from "@/lib/access";
import { requireTeacher } from "@/lib/auth/server";
import { lectureMediaUrl } from "@/lib/media";
import { loadClassReport } from "@/lib/teacher";
import DeskShell from "@/components/DeskShell";
import TeacherView from "@/components/TeacherView";

export const metadata: Metadata = {
  title: "Class insights · TraceIt",
  description:
    "Find the minute your class lost the thread: anonymous hesitation and erasing over a lecture, never a name or a face.",
};

export default async function TeacherPage(props: PageProps<"/teacher/[lectureId]">) {
  // Always the class as it is now (never prerendered).
  await connection();
  const { lectureId } = await props.params;
  // Signed out → sign in; a student → 404; a lecture outside the teacher's classes → 404.
  const teacher = await requireTeacher(`/teacher/${encodeURIComponent(lectureId)}`);
  const [report, taught] = await Promise.all([loadClassReport(lectureId, teacher), taughtLecture(teacher, lectureId)]);
  if (!report || !taught) notFound();
  return (
    <DeskShell active="class">
      <TeacherView
        report={report}
        mediaSrc={lectureMediaUrl(report.lecture.id)}
        classInfo={{ id: taught.cls.id, name: taught.cls.name }}
      />
    </DeskShell>
  );
}
