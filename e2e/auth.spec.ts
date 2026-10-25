import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, PASSWORD, SIGNED_OUT } from "./accounts";

// Accounts: signed out, every page sends you to /signin (and back where you were going after
// signing in), every API answers 401, ?next= can't send you off-site, and signing out ends access.

test.use({ storageState: SIGNED_OUT });

async function signIn(page: Page, email: string, password: string) {
  const form = page.getByTestId("signin-form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

test("signed out, /app redirects to sign-in and comes back after signing in", async ({ page }) => {
  await page.goto("/app");
  await page.waitForURL((url) => url.pathname === "/signin" && url.searchParams.get("next") === "/app");
  expect(new URL(page.url()).search).toBe("?next=%2Fapp");
  await signIn(page, ACCOUNTS.student.email, PASSWORD);
  await page.waitForURL((url) => url.pathname === "/app");
  await expect(page.getByTestId("user-menu")).toContainText(ACCOUNTS.student.name);
});

test("a deep link survives sign-in, and a wrong password shows a generic error", async ({ page }) => {
  await page.goto("/progress");
  await page.waitForURL((url) => url.pathname === "/signin" && url.searchParams.get("next") === "/progress");
  await signIn(page, ACCOUNTS.student.email, "not-the-password");
  await expect(page.getByTestId("auth-error")).toHaveText("Email or password is incorrect.");
  await expect(page).toHaveURL(/\/signin\?next=%2Fprogress$/);
  await signIn(page, ACCOUNTS.student.email, PASSWORD);
  await page.waitForURL((url) => url.pathname === "/progress");
});

test("?next= never leads off the site", async ({ page }) => {
  for (const next of ["//evil.example/steal", "https://evil.example/", "/\\evil.example"]) {
    await page.context().clearCookies();
    await page.goto(`/signin?next=${encodeURIComponent(next)}`);
    await signIn(page, ACCOUNTS.student.email, PASSWORD);
    await page.waitForURL((url) => url.pathname === "/app");
    expect(new URL(page.url()).host).toBe("localhost:3100");
  }
});

test("signed out, the APIs answer 401 (the health check stays public)", async ({ request }) => {
  for (const path of ["/api/auth/me", "/api/sessions", "/api/sessions/s_any", "/api/sessions/s_any/timeline", "/api/progress", "/api/classes"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in to continue." });
  }
  expect((await request.post("/api/sessions", { data: { title: "nope" } })).status()).toBe(401);
  expect((await request.post("/api/sessions/s_any/strokes", { data: { strokes: [], eraseEvents: [] } })).status()).toBe(401);
  expect((await request.post("/api/events/e_any/help")).status()).toBe(401);
  expect((await request.get("/api/lectures/demo-chain-rule/media")).status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("signing out ends the session for the page and the API", async ({ browser }) => {
  // Its own sign-in (signing out the shared e2e state would sign every later spec out).
  const context = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await context.newPage();
  const signedIn = await context.request.post("/api/auth/signin", { data: { email: ACCOUNTS.student.email, password: PASSWORD } });
  expect(signedIn.status()).toBe(200);
  expect((await context.request.get("/api/auth/me")).status()).toBe(200);

  await page.goto("/account");
  await page.getByTestId("signout").click();
  await page.waitForURL((url) => url.pathname === "/signin");
  expect((await context.cookies()).some((c) => c.name === "traceit_session" && c.value !== "")).toBe(false);
  expect((await context.request.get("/api/auth/me")).status()).toBe(401);
  await page.goto("/app");
  await page.waitForURL((url) => url.pathname === "/signin" && url.searchParams.get("next") === "/app");
  await context.close();
});
