import { withUser } from "@/lib/auth/core";
import { notFoundJson } from "@/lib/access";
import { sameOriginOnly } from "@/lib/http";
import { loadClassReport } from "@/lib/teacher";

/**
 * The teacher view of a lecture ("Where did the class get lost?"): anonymous, k-anonymous class
 * aggregates of the students enrolled in the lecture's class only — a heatmap of erasing /
 * struggling per 30 s and the top stretches to re-teach. Only that class's teacher may read it:
 * 401 signed out, 403 for students, 404 when the lecture is unknown or not in a class they teach.
 * No session ids, student ids or ink ever appear in the response (see lib/teacher).
 */
export const GET = sameOriginOnly(
  withUser(async (_request: Request, user, ctx: RouteContext<"/api/lectures/[id]/class">) => {
    if (user.role !== "teacher") {
      return Response.json({ error: "Class insights are for teachers." }, { status: 403 });
    }
    const { id } = await ctx.params;
    const report = await loadClassReport(id, user);
    if (!report) return notFoundJson("lecture");
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  }),
);
