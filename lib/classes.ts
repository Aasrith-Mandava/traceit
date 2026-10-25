import "server-only";

// Classes: join codes (8 characters of Crockford base32 — no I, L, O or U, so a code read aloud or
// copied off a whiteboard can't be mistaken) and class creation with a fresh code.
import { randomInt } from "node:crypto";
import { cleanName } from "@/lib/auth/accounts";
import type { Db } from "@/lib/db";
import type { ClassInfo } from "@/lib/types";

export const JOIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
/** Tries before giving up on finding an unused code (32^8 ≈ 10^12: a collision is already rare). */
const CREATE_ATTEMPTS = 5;

export const UNKNOWN_CODE_MESSAGE = "No class has that code. Check it with your teacher and try again.";
export const CLASS_DEMO_MESSAGE = "Creating a class is available when you run TraceIt yourself.";

/** A random join code (crypto.randomInt, uniform over the alphabet). */
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  return code;
}

/**
 * The canonical form of a typed code: spaces and dashes dropped, uppercased, and the look-alikes
 * Crockford allows mapped (O → 0, I/L → 1). null when it can't be a code.
 */
export function normaliseJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const code = raw
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return JOIN_CODE_RE.test(code) ? code : null;
}

/** A class name: trimmed, inner whitespace collapsed, 1–80 characters; null otherwise. */
export const cleanClassName = (raw: unknown): string | null => cleanName(raw);

/** Creates a class for `teacherId` with a fresh join code (retrying on the rare collision). */
export async function createClassWithCode(db: Db, teacherId: string, name: string): Promise<ClassInfo> {
  for (let i = 0; i < CREATE_ATTEMPTS; i++) {
    const created = await db.createClass({ teacherId, name, joinCode: generateJoinCode() });
    if (created) return created;
  }
  throw new Error("could not find an unused join code");
}

/** The class a typed code belongs to, else null. */
export async function classForCode(db: Db, raw: unknown): Promise<ClassInfo | null> {
  const code = normaliseJoinCode(raw);
  return code ? db.getClassByJoinCode(code) : null;
}
