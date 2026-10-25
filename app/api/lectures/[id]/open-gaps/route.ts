import { notFoundJson, ownedSession, visibleLecture } from "@/lib/access";
import { withUser } from "@/lib/auth/core";
import { getLectureGaps } from "@/lib/gaps";
import { sameOriginOnly } from "@/lib/http";

/**
 * The signed-in student's open gap threads of a lecture. With `?session=<id>` (one of their own
 * sessions): only those from sessions before it, plus `carried` (what that session resolved or
 * repeated) for the review's "Carried over".
 */
export const GET = sameOriginOnly(withUser(async (request, user, ctx: RouteContext<"/api/lectures/[id]/open-gaps">) => {
  const { id } = await ctx.params;
  if (!(await visibleLecture(user, id))) return notFoundJson("lecture");
  const sessionId = new URL(request.url).searchParams.get("session") ?? undefined;
  if (sessionId !== undefined && (sessionId.length === 0 || sessionId.length > 200)) {
    return Response.json({ error: "invalid session" }, { status: 400 });
  }
  if (sessionId !== undefined && !(await ownedSession(user, sessionId))) return notFoundJson("session");
  return Response.json(await getLectureGaps(id, { studentId: user.id, sessionId }));
}));
