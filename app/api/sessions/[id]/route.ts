import { notFoundJson, ownedSession } from "@/lib/access";
import { withUser } from "@/lib/auth/core";
import { getDb } from "@/lib/db";

export const GET = withUser(async (_req, user, ctx: RouteContext<"/api/sessions/[id]">) => {
  const { id } = await ctx.params;
  const session = await ownedSession(user, id);
  if (!session) return notFoundJson("session");
  const db = getDb();
  const [strokes, eraseEvents] = await Promise.all([db.getStrokes(id), db.getEraseEvents(id)]);
  return Response.json({ session, strokes, eraseEvents });
});
