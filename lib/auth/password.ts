import "server-only";

// Password hashing: scrypt from node:crypto (no dependency). Stored as
// `scrypt$N$r$p$salt$hash` (base64url), so the cost can change later without breaking old hashes.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** ~128 MB and ~0.2 s per hash. */
export const DEFAULT_SCRYPT: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
/** Cheap parameters for unit tests only (never used by the app outside vitest). */
export const TEST_SCRYPT: ScryptParams = { N: 2 ** 10, r: 8, p: 1 };

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_N = 2 ** 20;

/** The app's parameters: DEFAULT_SCRYPT, except under vitest (where hashing 128 MB per test is waste). */
const appParams = (): ScryptParams => (process.env.VITEST ? TEST_SCRYPT : DEFAULT_SCRYPT);

function derive(password: string, salt: Buffer, keyLen: number, { N, r, p }: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLen, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string, params: ScryptParams = appParams()): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, KEY_BYTES, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-time check; false for a malformed or out-of-range stored hash (never throws). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  // Refuse silly costs a corrupted row could ask for (CPU / memory exhaustion).
  if (!Number.isInteger(N) || N < 2 || N > MAX_N || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < 8 || expected.length < 16) return false;
  try {
    const key = await derive(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/**
 * Verified against when the email is unknown (or the account has no password), so a sign-in
 * takes the same time whether or not the account exists. Matches no password.
 */
export const DUMMY_HASH =
  "scrypt$131072$8$1$3XRufasY-flM8Hnai37U_Q$hhZHNWRspMz80icggE24zNgqmPNQKYHwcWiOszKmNoSIKKUm73tJ__m9g9eo35q1q7rHEGOt957XsrT2dRNzJg";
