import { startSession } from "@/lib/auth/core";
import { authLimits, ipOf, limitOrNull } from "@/lib/auth/limits";
import { getDb } from "@/lib/db";
import { DEMO_STUDENT_ID, DEMO_TEACHER_ID } from "@/lib/demoAccounts";
import { isDemoMode } from "@/lib/demoMode";
import { readBodyText, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 1024;
/** Guest sessions are short: the shared demo accounts are reset regularly anyway. */
const GUEST_SESSION_DAYS = 1;

/**
 * DEMO_MODE only: signs the visitor into a shared guest account — `{ as: "student" | "teacher" }`
 * (default student) → 200 `{ user }`. 404 outside DEMO_MODE, 503 until the demo is seeded.
 */
export const POST = sameOriginOnly(async (request: Request) => {
  if (!isDemoMode(process.env)) return Response.json({ error: "not found" }, { status: 404 });
  const limited = limitOrNull(authLimits.demoIp, ipOf(request));
  if (limited) return limited;
  const read = await readBodyText(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  let as: unknown = "student";
  if (read.value.trim()) {
    try {
      const body = JSON.parse(read.value) as unknown;
      if (body && typeof body === "object" && !Array.isArray(body) && "as" in body) as = (body as { as: unknown }).as;
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
  }
  if (as !== "student" && as !== "teacher") return Response.json({ error: 'as must be "student" or "teacher"' }, { status: 400 });

  const user = await getDb().getUser(as === "teacher" ? DEMO_TEACHER_ID : DEMO_STUDENT_ID);
  if (!user) return Response.json({ error: "The demo is still being set up. Try again in a minute." }, { status: 503 });
  const { setCookie } = await startSession(user.id, { request, ttlDays: GUEST_SESSION_DAYS });
  return Response.json({ user }, { headers: { "Set-Cookie": setCookie, "Cache-Control": "no-store" } });
});
