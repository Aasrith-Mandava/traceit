import "server-only";

// Ownership / visibility checks for route handlers and pages. Anything the user may not see is
// reported exactly like something that doesn't exist (null → 404), so ids can't be probed.
import { getDb, type LectureRecord } from "./db";
import type { ClassInfo, Session, TimelineEvent, User } from "./types";

/** The user's own session, else null. */
export async function ownedSession(user: User, id: string): Promise<Session | null> {
  const session = await getDb().getSession(id);
  return session && session.studentId === user.id ? session : null;
}

/** A stored event of one of the user's sessions (with that session), else null. */
export async function ownedEvent(user: User, eventId: string): Promise<{ event: TimelineEvent; session: Session } | null> {
  const event = await getDb().getEvent(eventId);
  if (!event) return null;
  const session = await ownedSession(user, event.sessionId);
  return session ? { event, session } : null;
}

/** A lecture the user may open (bundled demo, own, taught or enrolled class), else null. */
export async function visibleLecture(user: User, id: string): Promise<LectureRecord | null> {
  const db = getDb();
  if (!(await db.canViewLecture(user.id, id))) return null;
  return db.getLecture(id);
}

/** A lecture the user uploaded (cues / recording / transcribe are owner-only), else null. */
export async function ownedLecture(user: User, id: string): Promise<LectureRecord | null> {
  const record = await getDb().getLecture(id);
  return record && record.ownerId !== null && record.ownerId === user.id ? record : null;
}

/** A class the user teaches, else null. */
export async function taughtClass(user: User, classId: string): Promise<ClassInfo | null> {
  if (user.role !== "teacher") return null;
  const cls = await getDb().getClass(classId);
  return cls && cls.teacherId === user.id ? cls : null;
}

/** A lecture in a class the user teaches (with that class), else null. */
export async function taughtLecture(user: User, lectureId: string): Promise<{ record: LectureRecord; cls: ClassInfo } | null> {
  if (user.role !== "teacher") return null;
  const record = await getDb().getLecture(lectureId);
  if (!record?.classId) return null;
  const cls = await taughtClass(user, record.classId);
  return cls ? { record, cls } : null;
}

/** The 404 for anything unknown or not the user's: `{ error: "<what> not found" }`. */
export const notFoundJson = (what: string) => Response.json({ error: `${what} not found` }, { status: 404 });
