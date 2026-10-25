import { notFound } from "next/navigation";
import { ownedSession } from "@/lib/access";
import { requireUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getLectureGaps } from "@/lib/gaps";
import { getSessionLecture, isAiConfigured } from "@/lib/lecture";
import { liveLectureDisabled } from "@/lib/liveLecture";
import { isDemoMode } from "@/lib/demoMode";
import SessionCapture from "@/components/SessionCapture";

export default async function SessionPage(props: PageProps<"/session/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/session/${encodeURIComponent(id)}`);
  const db = getDb();
  const session = await ownedSession(user, id);
  if (!session) notFound();
  const [strokes, { lecture, words }, lectureGaps] = await Promise.all([
    db.getStrokes(id),
    getSessionLecture(session.lectureId),
    getLectureGaps(session.lectureId, { studentId: user.id, sessionId: id }),
  ]);
  // New on every render: SessionCapture refreshes a copy restored by back / forward (stale ink).
  const loadId = crypto.randomUUID();
  return (
    <SessionCapture
      key={loadId}
      loadId={loadId}
      session={session}
      lecture={lecture}
      words={words}
      aiConfigured={isAiConfigured()}
      initialStrokes={strokes}
      openGaps={lectureGaps.open}
      liveAvailable={!liveLectureDisabled(process.env)}
      transcribeAvailable={!isDemoMode(process.env)}
    />
  );
}
