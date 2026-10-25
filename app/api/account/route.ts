import { cleanName, NAME_MAX } from "@/lib/auth/accounts";
import { withUser } from "@/lib/auth/core";
import { getDb } from "@/lib/db";
import { readJsonBody, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 2 * 1024;

/**
 * Updates the signed-in user's profile: `{ name }` → 200 `{ user }`. 400 invalid name, 401 signed
 * out, 403 for the shared demo accounts (everyone signs into them).
 */
export const PATCH = sameOriginOnly(
  withUser(async (request: Request, user) => {
    if (user.guest) {
      return Response.json({ error: "The demo account’s name can’t be changed." }, { status: 403 });
    }
    const read = await readJsonBody(request, MAX_BODY_BYTES);
    if (!read.ok) return read.response;
    const body = read.value;
    const name = body && typeof body === "object" && !Array.isArray(body) ? cleanName((body as { name?: unknown }).name) : null;
    if (!name) return Response.json({ error: `Enter your name (up to ${NAME_MAX} characters).` }, { status: 400 });
    const updated = await getDb().setUserName(user.id, name);
    if (!updated) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    return Response.json({ user: updated }, { headers: { "Cache-Control": "no-store" } });
  }),
);
