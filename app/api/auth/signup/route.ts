import { SIGNUP_DEMO_MESSAGE, createAccount, parseSignUp } from "@/lib/auth/accounts";
import { startSession } from "@/lib/auth/core";
import { authLimits, ipOf, limitOrNull } from "@/lib/auth/limits";
import { isDemoMode } from "@/lib/demoMode";
import { readJsonBody, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Creates an account and signs it in: `{ name, email, password, role }` → 201 `{ user, adopted? }`
 * (adopted: the local data the first account took over). 400 invalid input, 409 email taken,
 * 403 in DEMO_MODE, 429 too many sign-ups from this address.
 */
export const POST = sameOriginOnly(async (request: Request) => {
  if (isDemoMode(process.env)) return Response.json({ error: SIGNUP_DEMO_MESSAGE }, { status: 403 });
  const limited = limitOrNull(authLimits.signUpIp, ipOf(request));
  if (limited) return limited;
  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = parseSignUp(read.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const created = await createAccount(parsed.value);
  if (!created) {
    return Response.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  }
  const { setCookie } = await startSession(created.user.id, { request });
  return Response.json(
    { user: created.user, ...(created.adopted ? { adopted: created.adopted } : {}) },
    { status: 201, headers: { "Set-Cookie": setCookie, "Cache-Control": "no-store" } },
  );
});
