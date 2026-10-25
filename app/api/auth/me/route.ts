import { unauthorizedJson, userFromRequest } from "@/lib/auth/core";

/** The signed-in user → `{ user }`, else 401. */
export async function GET(request: Request) {
  const user = await userFromRequest(request);
  if (!user) return unauthorizedJson();
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
