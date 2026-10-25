import "server-only";

// Sign-up / sign-in logic shared by the /api/auth routes: input validation, account creation
// (with first-account adoption of local data) and password checks.
import { LOCAL_STUDENT_ID, getDb, normaliseEmail, type Db } from "@/lib/db";
import { DEMO_SESSION_IDS } from "@/lib/demoAccounts";
import { isDemoMode } from "@/lib/demoMode";
import type { Role, User } from "@/lib/types";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254;

export const SIGNUP_DEMO_MESSAGE = "Creating an account is available when you run TraceIt yourself.";
export const SIGNIN_FAILED_MESSAGE = "Email or password is incorrect.";

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Trimmed, inner whitespace collapsed; null when empty, too long or with control characters. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(raw.replace(/[\t\n\r]/g, " "))) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

/** Lowercased email, or null when it doesn't look like one (`.invalid` is reserved for demo accounts). */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = normaliseEmail(raw);
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (email.endsWith(".invalid")) return null;
  return email;
}

export function parseSignUp(body: unknown): Parsed<SignUpInput> {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const name = cleanName(body.name);
  if (!name) return { ok: false, error: `Enter your name (up to ${NAME_MAX} characters).` };
  const email = cleanEmail(body.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  const { password, role } = body;
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { ok: false, error: `Choose a password of ${PASSWORD_MIN}–${PASSWORD_MAX} characters.` };
  }
  if (role !== "student" && role !== "teacher") return { ok: false, error: "Choose student or teacher." };
  return { ok: true, value: { name, email, password, role } };
}

export function parseSignIn(body: unknown): Parsed<{ email: string; password: string }> {
  if (!isObject(body)) return { ok: false, error: "body must be an object" };
  const { email, password } = body;
  if (typeof email !== "string" || !email.trim() || email.length > EMAIL_MAX) {
    return { ok: false, error: "Enter your email and password." };
  }
  if (typeof password !== "string" || !password || password.length > PASSWORD_MAX) {
    return { ok: false, error: "Enter your email and password." };
  }
  return { ok: true, value: { email: normaliseEmail(email), password } };
}

/** First-account adoption of local data: not in DEMO_MODE, and TRACEIT_ADOPT_LOCAL_DATA isn't "0". */
export function adoptionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !isDemoMode(env) && env.TRACEIT_ADOPT_LOCAL_DATA?.trim() !== "0";
}

export interface Adopted {
  sessions: number;
  lectures: number;
}

/**
 * What the first account would adopt (for the sign-up page notice), or null when nothing would be:
 * adoption is off, an account already exists, or there is no local data.
 */
export async function localDataToAdopt(db: Db = getDb()): Promise<Adopted | null> {
  if (!adoptionEnabled() || (await db.countAccounts()) > 0) return null;
  const keep = new Set(DEMO_SESSION_IDS);
  const sessions = (await db.listStudentSessions(LOCAL_STUDENT_ID)).filter((s) => !keep.has(s.id)).length;
  let lectures = 0;
  for (const l of await db.listLectures()) {
    if (l.transcriptSource === "demo") continue;
    if ((await db.getLecture(l.id))?.ownerId === null) lectures++;
  }
  return sessions || lectures ? { sessions, lectures } : null;
}

/**
 * Creates an account (password hashed before the transaction). The first account (when
 * adoptionEnabled) adopts the local student's sessions — except the seeded demo's — and every
 * owner-less uploaded lecture, in the same transaction. Nothing is ever deleted.
 * Null when the email is taken.
 */
export async function createAccount(
  input: SignUpInput,
  db: Db = getDb(),
): Promise<{ user: User; adopted: Adopted | null } | null> {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const adopt = adoptionEnabled() && (await tx.countAccounts()) === 0;
    const user = await tx.createUser({ email: input.email, name: input.name, role: input.role, passwordHash });
    if (!user) return null;
    const adopted = adopt ? await tx.adoptLegacyData(LOCAL_STUDENT_ID, user.id, [...DEMO_SESSION_IDS]) : null;
    return { user, adopted: adopted && (adopted.sessions || adopted.lectures) ? adopted : null };
  });
}

/**
 * The account for an email + password, or null. Unknown emails and guest accounts are checked
 * against DUMMY_HASH, so every failure costs the same time.
 */
export async function authenticate(email: string, password: string, db: Db = getDb()): Promise<User | null> {
  const found = await db.getUserByEmail(email);
  const ok = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
  return ok && found?.passwordHash ? found.user : null;
}
