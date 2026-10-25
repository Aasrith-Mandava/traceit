import { withUser } from "@/lib/auth/core";
import { CLASS_DEMO_MESSAGE, cleanClassName, createClassWithCode } from "@/lib/classes";
import { getDb } from "@/lib/db";
import { isDemoMode } from "@/lib/demoMode";
import { readJsonBody, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 2 * 1024;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * The signed-in user's classes: teachers → `{ role: "teacher", classes: TeacherClass[] }` (newest
 * first, with join code, roster and lecture counts); students → `{ role: "student", classes:
 * StudentClass[] }` ({ id, name, teacherName }, in joining order). 401 signed out.
 */
export const GET = sameOriginOnly(
  withUser(async (_request: Request, user) => {
    const db = getDb();
    if (user.role === "teacher") {
      return Response.json({ role: "teacher", classes: await db.listTeacherClasses(user.id) }, { headers: NO_STORE });
    }
    return Response.json({ role: "student", classes: await db.listStudentClasses(user.id) }, { headers: NO_STORE });
  }),
);

/**
 * Creates a class (teachers only): `{ name }` → 201 `{ class: ClassInfo }` with a fresh join code.
 * 400 invalid name, 401 signed out, 403 students or DEMO_MODE.
 */
export const POST = sameOriginOnly(
  withUser(async (request: Request, user) => {
    if (user.role !== "teacher") return Response.json({ error: "Only teachers can create classes." }, { status: 403 });
    if (isDemoMode(process.env)) return Response.json({ error: CLASS_DEMO_MESSAGE }, { status: 403 });
    const read = await readJsonBody(request, MAX_BODY_BYTES);
    if (!read.ok) return read.response;
    const body = read.value;
    const name = body && typeof body === "object" && !Array.isArray(body) ? cleanClassName((body as { name?: unknown }).name) : null;
    if (!name) return Response.json({ error: "Give the class a name (up to 80 characters)." }, { status: 400 });
    const created = await createClassWithCode(getDb(), user.id, name);
    return Response.json({ class: created }, { status: 201, headers: NO_STORE });
  }),
);
