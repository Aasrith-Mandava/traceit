import "server-only";

// The DEMO_MODE accounts: shared guests (no password) that "Try the demo" / "Try the teacher view"
// sign visitors into, the seeded classmates, and the demo class the bundled lecture belongs to.
import { LOCAL_STUDENT_ID, type Db } from "./dbShared";
import { DEMO_LECTURE } from "./demo";
import { DEMO_CLASSMATES, DEMO_SESSIONS, classmateSessionId, classmateStudentId } from "./demoScenario";
import type { Role } from "./types";

/** Maya, the demo student (the pre-accounts local student id). */
export const DEMO_STUDENT_ID = LOCAL_STUDENT_ID;
export const DEMO_TEACHER_ID = "demo-teacher";
export const DEMO_CLASS_ID = "demo-class";
/** 8 characters of Crockford base32 (no I, L, O, U), like generated codes. */
export const DEMO_JOIN_CODE = "MAYA2026";
export const DEMO_CLASS_NAME = "Calculus I";

/** The guest accounts visitors are signed into (what demo reset prunes visitor content of). */
export const GUEST_IDS: readonly string[] = [DEMO_STUDENT_ID, DEMO_TEACHER_ID];

/** Sessions the seeded demo owns (never adopted by a local account, never pruned by reset). */
export const DEMO_SESSION_IDS: readonly string[] = [
  DEMO_SESSIONS.s1.id,
  DEMO_SESSIONS.s2.id,
  ...Array.from({ length: DEMO_CLASSMATES }, (_, i) => classmateSessionId(i)),
];

interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: DEMO_STUDENT_ID, email: "maya@demo.invalid", name: "Maya", role: "student" },
  { id: DEMO_TEACHER_ID, email: "teacher@demo.invalid", name: "Ms. Rivera", role: "teacher" },
  ...Array.from({ length: DEMO_CLASSMATES }, (_, i) => ({
    id: classmateStudentId(i),
    email: `${classmateStudentId(i)}@demo.invalid`,
    name: `Classmate ${i + 1}`,
    role: "student" as const,
  })),
];

/**
 * Idempotently creates the demo accounts (guests: no password), the demo class taught by
 * DEMO_TEACHER_ID with Maya and the classmates enrolled, and puts the bundled lecture in it.
 * Called by the demo seed (lib/demoSeed). Never touches real accounts.
 */
export async function ensureDemoUsers(db: Db): Promise<void> {
  for (const u of DEMO_USERS) {
    if (!(await db.getUser(u.id))) await db.createUser({ ...u, passwordHash: null });
  }
  if (!(await db.getClass(DEMO_CLASS_ID))) {
    await db.createClass({ id: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, name: DEMO_CLASS_NAME, joinCode: DEMO_JOIN_CODE });
  }
  for (const u of DEMO_USERS) if (u.role === "student") await db.enroll(DEMO_CLASS_ID, u.id);
  await db.setLectureClass(DEMO_LECTURE.lectureId, DEMO_CLASS_ID);
}
