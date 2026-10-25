import { expect, test, type Page } from "@playwright/test";
import { DEMO_BASE, SIGNED_OUT } from "./accounts";

// Phase 8 — demo-proof. The whole two-minute demo against the production build (`npm run demo`:
// next start, DEMO_MODE=1) on a freshly seeded database (`npm run seed:demo -- --reset`), with every
// non-localhost request blocked. Nothing may try to reach the network, and nothing may log an error.
// Screenshots of each stop land in screenshots/demo-*.png.
// Signed in as the shared guest Maya (the project's storage state: "Try the demo"); the last tests
// start signed out, as a visitor does.

test.use({ viewport: { width: 1180, height: 820 } });

const S1 = "demo-maya-1";
const S2 = "demo-maya-2";

const isLocal = (raw: string) => {
  const url = new URL(raw);
  if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") return true;
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
};

const marker = (page: Page, type: string) => page.locator(`[data-testid="timeline-marker"][data-type="${type}"]`);

/** Scrolls the moment panel (not the page) so `testId` sits near the bottom of the viewport. */
async function showInPanel(page: Page, testId: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('aside[aria-label="Moment details"]').evaluate((aside, id) => {
    const el = aside.querySelector(`[data-testid="${id}"]`);
    if (el) aside.scrollTop += el.getBoundingClientRect().bottom - (window.innerHeight - 16);
  }, testId);
}

const shot = (page: Page, name: string) => page.screenshot({ path: `screenshots/${name}.png`, animations: "disabled" });

test("the two-minute demo runs end to end, offline, with no errors", async ({ page, context }) => {
  test.setTimeout(180_000);
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (r) => {
    if (!isLocal(r.url())) external.push(r.url());
  });
  await context.route((url) => !isLocal(url.toString()), (route) => route.abort("internetdisconnected"));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. Home: Maya's two sessions (classmates only feed the class hotspots), with stroke counts.
  await page.goto("/app");
  const rows = page.getByTestId("session-link");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Maya · Session 2");
  await expect(rows.nth(1)).toContainText("Maya · Session 1");
  await expect(page.locator(`a[href="/session/${S1}"] [data-testid="session-stroke-count"]`)).toContainText(/\d+ pen strokes/);
  await expect(page.getByTestId("open-gaps-count")).toHaveText("0");
  await shot(page, "demo-01-home");

  // 2. Session 1 review: a breakthrough already earned, the correction, the gap.
  await page.getByRole("link", { name: "Review Maya · Session 1" }).click();
  await page.waitForURL(new RegExp(`/review/${S1}$`));
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("count-breakthroughs")).toHaveText("1");
  await expect(page.getByTestId("count-corrected")).toHaveText("1");
  await expect(page.getByTestId("count-gaps")).toHaveText("1");

  // 3. Study mode opens the most important moment by itself — the correction (the gap was cleared in
  // Session 2): before/after, the AI reading, the help card — then the right answer.
  const detail = page.getByTestId("moment-detail");
  await expect(marker(page, "misconception_corrected")).toHaveAttribute("aria-pressed", "true");
  await expect(detail).toHaveAttribute("data-type", "misconception_corrected");
  await expect(page.getByTestId("moment-position")).toHaveText("Moment 1 of 3");
  await expect(page.getByTestId("moment-time")).toHaveText("01:40");
  await expect(page.getByTestId("before-canvas")).toBeVisible();
  await expect(page.getByTestId("after-canvas")).toBeVisible();
  await expect(page.getByTestId("revision-misconception")).toContainText("inner derivative");
  await expect(page.getByTestId("revision-before")).toContainText("cos(x^2)");
  await expect(page.getByTestId("help-source")).toHaveAttribute("data-source", "demo");
  await expect(page.getByTestId("help-reexplain")).toContainText("inner derivative");
  await expect(page.getByTestId("check-option")).toHaveCount(4);
  await showInPanel(page, "revision-reading");
  await shot(page, "demo-02-review-correction");
  await showInPanel(page, "check-submit");
  await shot(page, "demo-03-help-card");

  await page.getByTestId("check-option").filter({ hasText: "2x cos(x^2)" }).click();
  await page.getByTestId("check-submit").click();
  await expect(page.getByTestId("check-feedback")).toHaveAttribute("data-result", "correct");
  await expect(page.getByTestId("check-feedback")).toContainText("Aha moment!");
  await expect(detail).toHaveAttribute("data-type", "breakthrough");
  await expect(page.getByTestId("count-breakthroughs")).toHaveText("2");
  await expect(page.getByTestId("count-corrected")).toHaveText("0");
  await showInPanel(page, "check-feedback");
  await shot(page, "demo-04-breakthrough");

  // 4. The gap: resolved later, in Session 2. Replay 20 s plays the lecture at that moment.
  await marker(page, "unresolved_gap").click();
  await expect(detail).toHaveAttribute("data-type", "unresolved_gap");
  await expect(page.getByTestId("moment-status")).toContainText("Cleared");
  await expect(page.getByTestId("moment-history")).toContainText(/resolved/i);
  await expect(page.getByTestId("help-source")).toHaveAttribute("data-source", "demo");
  const replay = page.getByTestId("replay");
  await expect(replay).toHaveText("Play this part");
  await replay.click();
  await expect(replay).toHaveAttribute("data-replay-state", "playing");
  await page.waitForTimeout(1200);
  await showInPanel(page, "replay");
  await shot(page, "demo-05-gap-replay");
  await replay.click();
  await expect(replay).not.toHaveAttribute("data-replay-state", "playing");

  // 5. Study mode's "Download PDF" is the export; Compare with Notability (the exported final page vs
  // the process it hides) is a demo page, opened by URL.
  await expect(page.getByTestId("download-pdf")).toHaveAttribute("href", `/api/sessions/${S1}/export`);
  const exported = await page.request.get(`/api/sessions/${S1}/export`);
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toBe("application/pdf");
  await page.goto(`/compare/${S1}`);
  await expect(page.getByTestId("notability-pdf-canvas")).toBeVisible();
  await expect(page.getByTestId("hidden-breakthroughs")).toHaveText("2");
  await expect(page.getByTestId("hidden-gaps")).toHaveText("1");
  await page.getByTestId("mode-overlay").click();
  await expect(page.getByTestId("compare-mode")).toHaveAttribute("data-mode", "overlay");
  await expect(page.getByTestId("overlay-process")).toBeVisible();
  // The PDF really painted (not a blank canvas).
  await expect
    .poll(() =>
      page.getByTestId("notability-pdf-canvas").evaluate((el) => {
        const c = el as HTMLCanvasElement;
        const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) dark++;
        return dark;
      }),
    )
    .toBeGreaterThan(500);
  await shot(page, "demo-06-compare-overlay");

  // 6. Progress: the gap resolved in Session 2 by writing it through; Maya's own hotspots from the DB.
  await page.goto("/progress");
  const thread = page.getByTestId("progress-thread");
  await expect(thread).toHaveCount(1);
  await expect(thread).toHaveAttribute("data-status", "resolved");
  await expect(thread).toHaveAttribute("data-resolved-by", "revisit");
  await expect(page.getByTestId("progress-thread-label")).toHaveText("Chain versus product rule");
  const hotspots = page.getByTestId("hotspots");
  await expect(hotspots).toBeVisible();
  await expect(hotspots).toContainText("Where you slowed down");
  const peak = Number(await hotspots.getAttribute("data-peak-ms"));
  expect([90_000, 240_000, 330_000]).toContain(peak);
  await shot(page, "demo-07-progress-hotspots");

  // 7. Capture with the live hesitation meter (looked at, never written on): Session 2 reads steady;
  // Session 1 with the lecture at 04:24 — right after the slow, erased attempt — reads hesitating.
  await page.goto(`/session/${S2}`);
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-drawn-count", /^[1-9]\d*$/);
  const meter = page.getByTestId("hesitation-meter");
  await expect(meter).toHaveAttribute("data-state", "steady");
  await page.goto(`/session/${S1}`);
  await expect(meter).toHaveAttribute("data-state", "steady");
  await page.locator("audio").evaluate((a) => {
    (a as HTMLAudioElement).currentTime = 264;
  });
  await expect(meter).toHaveAttribute("data-state", "stuck");
  await expect(meter).toHaveAttribute("aria-valuetext", /Thinking hard.*slower/);
  await shot(page, "demo-08-capture-meter");

  // 8. /about (the old "How it works" page) leads to My notes, which no longer has an "About this app"
  // footer. The health check still says which backend is live — and never a secret.
  await page.goto("/about");
  await page.waitForURL(/\/app$/);
  await expect(page.getByTestId("about-footer")).toHaveCount(0);
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  const healthText = await health.text();
  expect(JSON.parse(healthText)).toMatchObject({ ok: true, backend: expect.stringMatching(/^(sqlite|postgres)$/) });
  expect(healthText).not.toMatch(/sk-|postgres:\/\/|api_key/i);

  expect(external, "requests that tried to leave localhost").toEqual([]);
  expect(errors, "console errors").toEqual([]);
});

test("the health check and home page answer on the demo server", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ ok: true });
  const home = await request.get("/app");
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain("Maya · Session 1");
});

// The demo server runs without PUBLIC_UPLOADS: adding a lecture stays off, in the UI and the API.
// (With PUBLIC_UPLOADS=1 the same form is enabled; that path is covered by lib/__tests__/publicUploads.)
test("adding a lecture stays disabled on the demo without PUBLIC_UPLOADS", async ({ page, request }) => {
  await page.goto("/lectures/new");
  await expect(page.getByTestId("upload-demo-note")).toHaveText("Adding a lecture is available when you run TraceIt yourself.");
  await expect(page.getByTestId("upload-submit")).toBeDisabled();
  const res = await request.post("/api/lectures", {
    headers: { origin: "http://127.0.0.1:3101" },
    multipart: { title: "x", durationMs: "1000", media: { name: "a.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF0000WAVE") } },
  });
  expect(res.status()).toBe(403);
});

// A visitor arrives signed out: the sign-in page offers the demo (no sign-up on the public demo).
test.describe("signed out", () => {
  test.use({ storageState: SIGNED_OUT });

  test("“Try the demo” signs in as Maya and opens her notes", async ({ page }) => {
    await page.goto("/app");
    await page.waitForURL((url) => url.pathname === "/signin" && url.searchParams.get("next") === "/app");
    await expect(page.getByTestId("signin-form")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
    await page.getByTestId("try-demo-student").click();
    await page.waitForURL((url) => url.pathname === "/app");
    await expect(page.getByTestId("user-menu")).toContainText("Maya");
    const rows = page.getByTestId("session-link");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Maya · Session 1");
    // Creating an account is for self-hosted copies.
    const signup = await page.request.post("/api/auth/signup", {
      headers: { origin: DEMO_BASE },
      data: { name: "Visitor", email: "visitor@example.test", password: "long enough password", role: "student" },
    });
    expect(signup.status()).toBe(403);
  });

  test("“Try the teacher view” signs in as the demo teacher and opens the demo class", async ({ page }) => {
    await page.goto("/signin");
    await page.getByTestId("try-demo-teacher").click();
    await page.waitForURL((url) => url.pathname === "/classes");
    await expect(page.getByTestId("user-menu")).toBeVisible();
    const card = page.getByTestId("class-card").filter({ hasText: "Calculus I" });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("join-code")).toContainText(/MAYA[\s-]?2026/);
    // No new classes on the public demo.
    const created = await page.request.post("/api/classes", { headers: { origin: DEMO_BASE }, data: { name: "Mine" } });
    expect(created.status()).toBe(403);
  });
});
