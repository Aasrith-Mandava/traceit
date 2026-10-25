import { notFoundJson, ownedSession } from "@/lib/access";
import { withUser } from "@/lib/auth/core";
import { getTimeline } from "@/lib/analyze";

/** Stored analysis (events + revisions + windows). Does not compute; see POST …/analyze. */
export const GET = withUser(async (_req, user, ctx: RouteContext<"/api/sessions/[id]/timeline">) => {
  const { id } = await ctx.params;
  if (!(await ownedSession(user, id))) return notFoundJson("session");
  const timeline = await getTimeline(id);
  if (!timeline) return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(timeline);
});
