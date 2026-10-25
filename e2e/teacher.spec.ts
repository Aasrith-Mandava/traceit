import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { DEMO_BASE, STATE } from "./accounts";
import { buildPhase2Scenario } from "./fixtures/phase2-scenario";

// Track tuning: class insights ("Find the minute your class lost the thread." — anonymous, k-anonymous class
// patterns over a lecture of a class, counting only the students enrolled in it) and "Export for
// Notability" (a session exported as a 2-page PDF).
//   • On the e2e server a teacher creates a class, adds a lecture to it and two students join →
//     the privacy message (fewer than 3). Only that class's teacher may look; a student gets 404.
//   • On the seeded demo server (`npm run demo`, port 3101), as the demo teacher: Maya + 5
//     classmates are enrolled in the demo class → the heatmap and the top 3 moments to re-teach.

const EVIL = { Origin: "http://evil.example" };
const DEMO_LECTURE = "demo-chain-rule";
const WAV = readFileSync("e2e/fixtures/lecture-40s.wav");

/** Ids that must never appear in a class response. */
const FORBIDDEN = [/"sessionId"/, /"studentId"/, /demo-maya/, /demo-classmate/, /demo-student/];

async function createSessionWithInk(request: APIRequestContext, title: string, { analyze = true, lectureId }: { analyze?: boolean; lectureId?: string } = {}) {
  const created = await request.post("/api/sessions", { data: { title, ...(lectureId ? { lectureId } : {}) } });
  expect(created.status()).toBe(201);
  const { session } = (await created.json()) as { session: { id: string; lectureId: string } };
  const { strokes, eraseEvents } = buildPhase2Scenario(session.id);
  expect((await request.post(`/api/sessions/${session.id}/strokes`, { data: { strokes, eraseEvents } })).status()).toBe(200);
  if (analyze) expect((await request.post(`/api/sessions/${session.id}/analyze`)).status()).toBe(200);
  return session;
}

/** As the e2e teacher: a new class with a lecture in it, joined by both e2e students. */
async function classWithLecture(browser: Browser, request: APIRequestContext, name: string) {
  const teacher = await browser.newContext({ storageState: STATE.teacher });
  const created = await teacher.request.post("/api/classes", { data: { name } });
  expect(created.status()).toBe(201);
  const { class: cls } = (await created.json()) as { class: { id: string; joinCode: string } };
  const upload = await teacher.request.post("/api/lectures", {
    multipart: { title: `${name} lecture`, durationMs: "40000", classId: cls.id, media: { name: "lecture.wav", mimeType: "audio/wav", buffer: WAV } },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  const { lecture } = (await upload.json()) as { lecture: { id: string; classId?: string } };
  expect(lecture.classId).toBe(cls.id);
  const studentB = await browser.newContext({ storageState: STATE.studentB });
  for (const r of [request, studentB.request]) {
    expect((await r.post("/api/classes/join", { data: { code: cls.joinCode } })).status()).toBe(200);
  }
  return { teacher, studentB, cls, lectureId: lecture.id };
}

async function expectTwoPagePdf(body: Buffer) {
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const doc = await PDFDocument.load(body);
  expect(doc.getPageCount()).toBe(2);
}

test.describe("teacher view and Notability export (e2e server)", () => {
  test("a class smaller than 3 students gets the privacy message, never numbers or ids", async ({ page, request, browser }) => {
    const { teacher, studentB, lectureId } = await classWithLecture(browser, request, `Privacy ${Date.now().toString(36)}`);
    // Both enrolled students write on the class's lecture; the teacher's own notes never count.
    const session = await createSessionWithInk(request, "Class notes A", { lectureId, analyze: false });
    await createSessionWithInk(studentB.request, "Class notes B", { lectureId, analyze: false });

    const res = await teacher.request.get(`/api/lectures/${lectureId}/class`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    for (const re of FORBIDDEN) expect(text).not.toMatch(re);
    expect(text).not.toContain(session.id);
    const body = JSON.parse(text) as { view: { status: string; buckets?: unknown }; source: string; bucketMs: number };
    // Two students in the class: fewer than 3.
    expect(body.view).toEqual({ status: "too-few" });
    expect(body.bucketMs).toBe(30_000);
    expect(body.source).toMatch(/SQLite|Postgres|Tiger Data/);

    const tpage = await teacher.newPage();
    await tpage.goto(`/teacher/${lectureId}`);
    const view = tpage.getByTestId("teacher-view");
    await expect(view).toHaveAttribute("data-status", "too-few");
    await expect(tpage.getByRole("heading", { name: "Find the minute your class lost the thread." })).toBeVisible();
    await expect(tpage.getByTestId("equity-line")).toContainText("Patterns from the whole room, never a name or a face.");
    await expect(tpage.getByTestId("teacher-privacy")).toContainText("Fewer than 3 students");
    await expect(tpage.getByTestId("teacher-heatmap")).toHaveCount(0);
    await expect(tpage.getByTestId("reteach-moment")).toHaveCount(0);

    // A student (even one in the class) gets 404 on the page and 403 on the API.
    expect((await page.goto(`/teacher/${lectureId}`))?.status()).toBe(404);
    expect((await request.get(`/api/lectures/${lectureId}/class`)).status()).toBe(403);
    await studentB.close();
    await teacher.close();
  });

  test("a class's page links each of its lectures to the class insights", async ({ browser, request }) => {
    const { teacher, studentB, cls, lectureId } = await classWithLecture(browser, request, `Links ${Date.now().toString(36)}`);
    const tpage = await teacher.newPage();
    await tpage.goto(`/classes/${cls.id}`);
    const link = tpage.locator(`[data-testid="class-insights-link"][href="/teacher/${lectureId}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await tpage.waitForURL(new RegExp(`/teacher/${lectureId}$`));
    await expect(tpage.getByTestId("teacher-view")).toBeVisible();
    // Another teacher's lecture (here: the bundled one, in no class of theirs) is 404.
    expect((await tpage.goto(`/teacher/${DEMO_LECTURE}`))?.status()).toBe(404);
    expect((await teacher.request.get(`/api/lectures/${DEMO_LECTURE}/class`)).status()).toBe(404);
    await studentB.close();
    await teacher.close();
  });

  test("the export is a 2-page PDF download, and the compare page links to it", async ({ page, request }) => {
    const session = await createSessionWithInk(request, "Teacher export");

    const res = await request.get(`/api/sessions/${session.id}/export`);
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers["content-type"]).toBe("application/pdf");
    expect(headers["content-disposition"]).toBe('attachment; filename="traceit-teacher-export.pdf"');
    expect(headers["x-content-type-options"]).toBe("nosniff");
    await expectTwoPagePdf(await res.body());

    await page.goto(`/compare/${session.id}`);
    const button = page.getByTestId("export-notability");
    await expect(button).toHaveText(/Export for Notability \(PDF\)/);
    await expect(button).toHaveAttribute("href", `/api/sessions/${session.id}/export`);
    await expect(button).toHaveAttribute("download", "");
    await expect(page.getByText("Import this PDF into Notability to keep your process next to your notes.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("traceit-teacher-export.pdf");
  });

  test("an export of a never-analysed session analyses it first, so its moments match the review's counts", async ({ request }) => {
    const session = await createSessionWithInk(request, "Teacher export unanalysed", { analyze: false });
    const before = (await (await request.get(`/api/sessions/${session.id}/timeline`)).json()) as { analyzed: boolean };
    expect(before.analyzed).toBe(false);

    const res = await request.get(`/api/sessions/${session.id}/export`);
    expect(res.status()).toBe(200);
    await expectTwoPagePdf(await res.body());

    const after = (await (await request.get(`/api/sessions/${session.id}/timeline`)).json()) as { analyzed: boolean; stale: boolean; events: Array<{ type: string }> };
    expect(after.analyzed).toBe(true);
    expect(after.stale).toBe(false);
    expect(after.events.map((e) => e.type)).toEqual(["misconception_corrected", "unresolved_gap"]);
  });

  test("unknown ids are 404 and cross-site requests are refused", async ({ browser, request }) => {
    const teacher = await browser.newContext({ storageState: STATE.teacher });
    expect((await teacher.request.get("/api/lectures/l_missing/class")).status()).toBe(404);
    expect((await request.get("/api/sessions/s_missing/export")).status()).toBe(404);
    expect((await (await teacher.newPage()).goto("/teacher/l_missing"))?.status()).toBe(404);
    expect((await teacher.request.get(`/api/lectures/${DEMO_LECTURE}/class`, { headers: EVIL })).status()).toBe(403);
    await teacher.close();
    const session = await createSessionWithInk(request, "Teacher cross-site");
    expect((await request.get(`/api/sessions/${session.id}/export`, { headers: EVIL })).status()).toBe(403);
  });
});

test.describe("teacher view on the seeded demo (Maya + 5 classmates), as the demo teacher", () => {
  test.use({ baseURL: DEMO_BASE, storageState: STATE.demoTeacher });

  test("heatmap and top 3 moments, k-anonymous, with no ids in the API", async ({ page, request }) => {
    const res = await request.get(`/api/lectures/${DEMO_LECTURE}/class`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    for (const re of FORBIDDEN) expect(text).not.toMatch(re);
    const { view } = JSON.parse(text) as {
      view: { status: string; classSize: number; buckets: Array<{ students: number | null }>; moments: Array<{ students: number | null; studentsLabel: string; startMs: number }> };
    };
    expect(view.status).toBe("ready");
    expect(view.classSize).toBe(6);
    expect(view.moments).toHaveLength(3);
    // k-anonymity: a shown count is always at least 3.
    for (const b of view.buckets) if (b.students !== null) expect(b.students).toBeGreaterThanOrEqual(3);
    for (const m of view.moments) {
      if (m.students === null) expect(m.studentsLabel).toBe("fewer than 3 students");
      else expect(m.students).toBeGreaterThanOrEqual(3);
    }
    // The scenario's tricky stretches: sin(x²) (~01:30), product vs chain (~04:00), sin²x (~05:20).
    const starts = view.moments.map((m) => m.startMs).sort((a, b) => a - b);
    expect(starts[0]).toBeGreaterThanOrEqual(60_000);
    expect(starts[0]).toBeLessThan(120_000);
    expect(starts.some((s) => s >= 210_000 && s < 270_000)).toBe(true);

    await page.goto(`/teacher/${DEMO_LECTURE}`);
    await expect(page.getByTestId("teacher-view")).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("equity-line")).toContainText("Patterns from the whole room, never a name or a face.");
    await expect(page.getByTestId("teacher-heatmap")).toBeVisible();
    await expect(page.getByTestId("heatmap-column")).toHaveCount(12);
    await expect(page.getByTestId("teacher-source")).toHaveText(/SQLite · computed in TypeScript|Postgres · date_bin|Tiger Data · TimescaleDB continuous aggregate/);
    const moments = page.getByTestId("reteach-moment");
    await expect(moments).toHaveCount(3);
    await expect(moments.first().getByTestId("moment-students")).toContainText(/\d+ students|Fewer than 3 students/);
    await expect(moments.first().getByTestId("moment-excerpt")).not.toBeEmpty();

    // Play this moment: the lecture jumps to the stretch and plays.
    const play = moments.first().getByTestId("play-moment");
    await play.click();
    await expect(play).toHaveAttribute("data-state", "playing");
    await expect(page.getByTestId("teacher-playing")).toContainText("Playing the lecture");
    const startMs = Number(await moments.first().getAttribute("data-start-ms"));
    const t = await page.getByTestId("teacher-media").evaluate((m: HTMLMediaElement) => m.currentTime * 1000);
    expect(t).toBeGreaterThanOrEqual(startMs - 1);
    await play.click();
    await expect(play).toHaveAttribute("data-state", "idle");

    // Keyboard: the heatmap's tooltip follows the arrow keys.
    await page.getByRole("group", { name: /Class heatmap/ }).focus();
    await page.keyboard.press("End");
    await expect(page.getByTestId("heatmap-tooltip")).toContainText("05:30–06:00");
  });

});

test.describe("Maya's export on the seeded demo", () => {
  test.use({ baseURL: DEMO_BASE, storageState: STATE.demoStudent });

  test("Maya's session exports as a 2-page PDF", async ({ request }) => {
    const res = await request.get("/api/sessions/demo-maya-1/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toBe('attachment; filename="traceit-maya-session-1.pdf"');
    await expectTwoPagePdf(await res.body());
  });
});
