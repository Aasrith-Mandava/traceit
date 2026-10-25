import { SIGNIN_FAILED_MESSAGE, authenticate, parseSignIn } from "@/lib/auth/accounts";
import { startSession } from "@/lib/auth/core";
import { authLimits, ipOf, limitOrNull, tooManyAttempts } from "@/lib/auth/limits";
import { readJsonBody, sameOriginOnly } from "@/lib/http";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Signs in with `{ email, password }` → 200 `{ user }` + session cookie. Every failure is the same
 * generic 401. 429 (Retry-After) after 30 attempts per address or 10 failures per email in 15 min.
 */
export const POST = sameOriginOnly(async (request: Request) => {
  const limited = limitOrNull(authLimits.signInIp, ipOf(request));
  if (limited) return limited;
  const read = await readJsonBody(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = parseSignIn(read.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { email, password } = parsed.value;

  const wait = authLimits.signInFailures.retryAfterMs(email);
  if (wait > 0) return tooManyAttempts(wait);
  const user = await authenticate(email, password);
  if (!user) {
    authLimits.signInFailures.take(email);
    return Response.json({ error: SIGNIN_FAILED_MESSAGE }, { status: 401 });
  }
  const { setCookie } = await startSession(user.id, { request });
  return Response.json({ user }, { headers: { "Set-Cookie": setCookie, "Cache-Control": "no-store" } });
});
