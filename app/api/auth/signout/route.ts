import { endSessionCookie, revokeSession } from "@/lib/auth/core";
import { sameOriginOnly } from "@/lib/http";

/** Ends the session (row deleted, cookie cleared) → 303 to /signin. Works as a plain form POST. */
export const POST = sameOriginOnly(async (request: Request) => {
  await revokeSession(request);
  return new Response(null, {
    status: 303,
    headers: { Location: "/signin", "Set-Cookie": endSessionCookie(request), "Cache-Control": "no-store" },
  });
});
