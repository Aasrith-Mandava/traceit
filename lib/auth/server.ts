import "server-only";

// Server Components / pages: who is signed in (once per request), and page guards. Pages call
// requireUser / requireTeacher themselves (never in layouts).
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@/lib/types";
import { SESSION_COOKIE, safeNext, userForToken } from "./core";

/** The signed-in user, or null (deduplicated per request). */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return userForToken(token);
});

/** The signed-in user; signed out → redirect to /signin?next=<nextPath>. */
export async function requireUser(nextPath: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(safeNext(nextPath))}`);
  return user;
}

/** A signed-in teacher; signed out → /signin, a student → 404. */
export async function requireTeacher(nextPath: string): Promise<User> {
  const user = await requireUser(nextPath);
  if (user.role !== "teacher") notFound();
  return user;
}
