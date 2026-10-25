import "server-only";

// In-memory rate limits for the account endpoints (one app instance; reset on restart).
import { createRateLimiter, type RateLimiter } from "@/lib/ai/limits";
import { clientIp } from "@/lib/landing/ask/origin";

const MIN = 60_000;

function create() {
  return {
    /** Sign-in attempts per IP: 30 / 15 min (every attempt counts). */
    signInIp: createRateLimiter({ limit: 30, windowMs: 15 * MIN }),
    /** Failed sign-ins per email: 10 / 15 min (check retryAfterMs first; take only on failure). */
    signInFailures: createRateLimiter({ limit: 10, windowMs: 15 * MIN }),
    /** Sign-ups per IP: 10 / hour. */
    signUpIp: createRateLimiter({ limit: 10, windowMs: 60 * MIN }),
    /** Class joins per user: 20 / 10 min. */
    join: createRateLimiter({ limit: 20, windowMs: 10 * MIN }),
    /** DEMO_MODE guest sign-ins per IP: 30 / hour. */
    demoIp: createRateLimiter({ limit: 30, windowMs: 60 * MIN }),
  } satisfies Record<string, RateLimiter>;
}

export const authLimits = create();

/** Tests only: forget every recorded attempt. */
export function resetAuthLimits(): void {
  Object.assign(authLimits, create());
}

export const ipOf = (request: Request) => clientIp(request.headers);

/** 429 with Retry-After (seconds). */
export function tooManyAttempts(retryAfterMs: number): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return Response.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}

/** Takes one use of `key` from `limiter`; the 429 to return when over the limit, else null. */
export function limitOrNull(limiter: RateLimiter, key: string): Response | null {
  if (limiter.take(key)) return null;
  return tooManyAttempts(limiter.retryAfterMs(key));
}
