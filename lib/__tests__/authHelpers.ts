import { randomUUID } from 'node:crypto';
import { startSession } from '../auth/core';
import { TEST_SCRYPT, hashPassword } from '../auth/password';
import type { Db } from '../db';
import type { Role, User } from '../types';

// Test helper (not a test file): a signed-in user and the Cookie header that authenticates as them.
//   const { user, cookie } = await signedInCookie(getDb(), { role: 'teacher' });
//   await POST(new Request(url, { method: 'POST', headers: { host, cookie }, body }));

export const TEST_PASSWORD = 'correct horse battery';

export interface SignedIn {
  user: User;
  /** Value for the request's `cookie` header. */
  cookie: string;
  /** The raw session token (what the cookie carries). */
  token: string;
}

export async function signedInCookie(
  db: Db,
  opts: { role?: Role; name?: string; email?: string; id?: string; guest?: boolean } = {},
): Promise<SignedIn> {
  const role = opts.role ?? 'student';
  let user = opts.id ? await db.getUser(opts.id) : null;
  if (!user) {
    user = await db.createUser({
      id: opts.id,
      email: opts.email ?? `${role}-${randomUUID()}@example.test`,
      name: opts.name ?? (role === 'teacher' ? 'Test Teacher' : 'Test Student'),
      role,
      passwordHash: opts.guest ? null : await hashPassword(TEST_PASSWORD, TEST_SCRYPT),
    });
  }
  if (!user) throw new Error('signedInCookie: could not create the user (email or id taken)');
  const { token } = await startSession(user.id, { request: new Request('http://localhost:3000/'), db });
  return { user, cookie: `traceit_session=${token}`, token };
}
