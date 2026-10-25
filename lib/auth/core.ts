import "server-only";

// Sign-in sessions for route handlers (no next/headers here: works on a plain Request, so unit
// tests call routes directly). The cookie carries 32 random bytes; the database stores only their
// sha256, so a leaked database can't be replayed as cookies.
import { createHash, randomBytes } from "node:crypto";
import { getDb, type Db } from "@/lib/db";
import type { User } from "@/lib/types";

export const SESSION_COOKIE = "traceit_session";
const DEFAULT_SESSION_DAYS = 30;
const DAY_MS = 86_400_000;
/** base64url of 32 bytes. Anything else is ignored without a database lookup. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** TRACEIT_SESSION_DAYS (default 30). */
export function sessionDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.TRACEIT_SESSION_DAYS?.trim());
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : DEFAULT_SESSION_DAYS;
}

/**
 * Whether to mark the cookie Secure: TRACEIT_COOKIE_SECURE=1/0 forces it; otherwise (auto) when
 * the request came over HTTPS (x-forwarded-proto from the proxy, else the request URL).
 */
export function cookieIsSecure(request: Request): boolean {
  const forced = process.env.TRACEIT_COOKIE_SECURE?.trim();
  if (forced === "1") return true;
  if (forced === "0") return false;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function cookieString(request: Request, value: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ...(cookieIsSecure(request) ? ["Secure"] : []),
  ].join("; ");
}

/**
 * Starts a session for `userId`: stores sha256(token) and returns the Set-Cookie header value.
 * `ttlDays` defaults to TRACEIT_SESSION_DAYS (guest demo sessions pass 1).
 */
export async function startSession(
  userId: string,
  opts: { request: Request; ttlDays?: number; db?: Db },
): Promise<{ token: string; setCookie: string }> {
  const days = opts.ttlDays ?? sessionDays();
  const token = randomBytes(32).toString("base64url");
  await (opts.db ?? getDb()).createAuthSession({
    tokenHash: hashToken(token),
    userId,
    expiresAtIso: new Date(Date.now() + days * DAY_MS).toISOString(),
  });
  return { token, setCookie: cookieString(opts.request, token, days * 86_400) };
}

/** Set-Cookie value that clears the session cookie. */
export const endSessionCookie = (request: Request) => cookieString(request, "", 0);

/** The session token from the request's Cookie header (only a well-formed one), else null. */
export function sessionTokenFrom(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (TOKEN_RE.test(value)) return value;
  }
  return null;
}

/** The user of a session token (cookie value), or null when absent, malformed or expired. */
export async function userForToken(token: string | null | undefined, db: Db = getDb()): Promise<User | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  return db.getAuthSessionUser(hashToken(token), new Date().toISOString());
}

export const userFromRequest = (request: Request, db?: Db) => userForToken(sessionTokenFrom(request), db);

/** Deletes the request's session row (if any). Sign-out. */
export async function revokeSession(request: Request, db: Db = getDb()): Promise<void> {
  const token = sessionTokenFrom(request);
  if (token) await db.deleteAuthSession(hashToken(token));
}

export const unauthorizedJson = () => Response.json({ error: "Sign in to continue." }, { status: 401 });

/**
 * Wraps a route handler so it only runs for a signed-in user (401 otherwise):
 *   export const POST = sameOriginOnly(withUser(async (req, user, ctx: RouteContext<"/api/x/[id]">) => …));
 */
export function withUser<Rest extends unknown[]>(
  handler: (request: Request, user: User, ...rest: Rest) => Promise<Response>,
): (request: Request, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const user = await userFromRequest(request);
    if (!user) return unauthorizedJson();
    return handler(request, user, ...rest);
  };
}

/**
 * A safe post-sign-in destination: a same-site path ("/…", not "//…" or "/\…"), else "/app".
 * Blocks open redirects through ?next=.
 */
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length > 2000) return "/app";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/app";
  // Control characters (tabs/newlines are stripped by URL parsers and can rebuild "//").
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/app";
  try {
    const url = new URL(raw, "https://traceit.invalid");
    if (url.origin !== "https://traceit.invalid") return "/app";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/app";
  }
}
