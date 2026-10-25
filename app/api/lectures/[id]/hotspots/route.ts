import { notFoundJson, taughtLecture, visibleLecture } from "@/lib/access";
import { withUser } from "@/lib/auth/core";
import { HOTSPOT_BUCKET_MS, getDb } from "@/lib/db";
import { sameOriginOnly } from "@/lib/http";

/**
 * Ink per 30 s of a lecture (counts only; no per-student data). The teacher of the lecture's class
 * sees the class (its enrolled students' sessions); anyone else only their own sessions. On Tiger
 * Data the unfiltered case reads a TimescaleDB continuous aggregate (refreshed every minute).
 */
export const GET = sameOriginOnly(withUser(async (_request, user, ctx: RouteContext<"/api/lectures/[id]/hotspots">) => {
  const { id } = await ctx.params;
  if (!(await visibleLecture(user, id))) return notFoundJson("lecture");
  const db = getDb();
  const taught = await taughtLecture(user, id);
  const studentIds = taught ? await db.listClassStudentIds(taught.cls.id) : [user.id];
  return Response.json({ lectureId: id, bucketMs: HOTSPOT_BUCKET_MS, hotspots: await db.lectureInkHotspots(id, studentIds) });
}));
