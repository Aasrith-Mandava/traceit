import { withUser } from "@/lib/auth/core";
import { getProgress } from "@/lib/gaps";
import { sameOriginOnly } from "@/lib/http";

/** Every gap thread of the signed-in student, per lecture: status, first seen, resolved when/how. */
export const GET = sameOriginOnly(withUser(async (_request, user) => Response.json(await getProgress(user.id))));
