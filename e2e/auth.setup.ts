import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test as setup, type APIResponse } from "@playwright/test";
import { ACCOUNTS, DEMO_BASE, E2E_BASE, PASSWORD, STATE, type E2eAccount } from "./accounts";

// Signs in every account the suite uses, once per run, and saves the cookies as storage states
// (e2e/.auth/*.json) that playwright.config.ts hands to each project; specs that need another
// person open a context with one of the other states.
//
// e2e server: sign up (POST /api/auth/signup). The server starts on a fresh database, so the first
// account (the main student) adopts the local data from before accounts — there is none on a fresh
// run. When a server is reused (`reuseExistingServer` outside CI) the account already exists → 409
// → sign in instead. Demo server (DEMO_MODE: no sign-up): "Try the demo" / "Try the teacher view"
// (POST /api/auth/demo) sign into the shared guests.
// The Origin header matches each server, as a browser's would (lib/http sameOriginOnly).

mkdirSync(dirname(STATE.student), { recursive: true });

async function expectUser(res: APIResponse, role: "student" | "teacher") {
  expect(res.status(), await res.text()).toBeLessThan(300);
  const { user } = (await res.json()) as { user: { id: string; role: string } };
  expect(user.role).toBe(role);
}

for (const account of Object.values(ACCOUNTS) as E2eAccount[]) {
  setup(`sign in ${account.name} (${account.role}) on the e2e server`, async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: E2E_BASE, extraHTTPHeaders: { Origin: E2E_BASE } });
    let res = await ctx.post("/api/auth/signup", {
      data: { name: account.name, email: account.email, password: PASSWORD, role: account.role },
    });
    if (res.status() === 409) res = await ctx.post("/api/auth/signin", { data: { email: account.email, password: PASSWORD } });
    await expectUser(res, account.role);
    await ctx.storageState({ path: account.state });
    await ctx.dispose();
  });
}

for (const as of ["student", "teacher"] as const) {
  setup(`sign in the demo ${as} guest on the demo server`, async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: DEMO_BASE, extraHTTPHeaders: { Origin: DEMO_BASE } });
    await expectUser(await ctx.post("/api/auth/demo", { data: { as } }), as);
    await ctx.storageState({ path: as === "student" ? STATE.demoStudent : STATE.demoTeacher });
    await ctx.dispose();
  });
}
