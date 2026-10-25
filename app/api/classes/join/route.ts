import { withUser } from "@/lib/auth/core";
import { authLimits, limitOrNull } from "@/lib/auth/limits";
import { UNKNOWN_CODE_MESSAGE, classForCode } from "@/lib/classes";
import { getDb } from "@/lib/db";
import { readJsonBody, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 1024;

/**
 * Joins a class with its code (students only): `{ code }` (spaces, dashes and case don't matter)
 * → 200 `{ class: { id, name, teacherName }, joined }` (joined: false when already enrolled).
 * 400 missing code, 401 signed out, 403 teachers, 404 unknown code, 429 too many tries.
 */
export const POST = sameOriginOnly(
  withUser(async (request: Request, user) => {
    if (user.role !== "student") {
      return Response.json({ error: "Teachers can’t join classes. Sign in with a student account to join." }, { status: 403 });
    }
    const limited = limitOrNull(authLimits.join, user.id);
    if (limited) return limited;
    const read = await readJsonBody(request, MAX_BODY_BYTES);
    if (!read.ok) return read.response;
    const body = read.value;
    const raw = body && typeof body === "object" && !Array.isArray(body) ? (body as { code?: unknown }).code : undefined;
    if (typeof raw !== "string" || !raw.trim()) return Response.json({ error: "Enter the class code." }, { status: 400 });

    const db = getDb();
    const cls = await classForCode(db, raw);
    if (!cls) return Response.json({ error: UNKNOWN_CODE_MESSAGE }, { status: 404 });
    const joined = await db.enroll(cls.id, user.id);
    return Response.json(
      { class: { id: cls.id, name: cls.name, teacherName: cls.teacherName }, joined },
      { headers: { "Cache-Control": "no-store" } },
    );
  }),
);
