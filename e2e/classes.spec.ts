import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Lecture } from "../lib/types";
import { STATE } from "./accounts";

// Classes: a teacher creates a class and gets a join code; a student joins with it (a link opens a
// confirmation, only the button enrolls); the teacher adds a lecture to the class and it appears in
// the student's "Pick a lecture" under the class's name. A student who isn't in the class can't
// open that lecture or its recording (404, as for a lecture that doesn't exist).

test.use({ viewport: { width: 1180, height: 820 } });

const WAV = readFileSync("e2e/fixtures/lecture-40s.wav");

async function uploadToClass(request: APIRequestContext, title: string, classId: string): Promise<Lecture> {
  const res = await request.post("/api/lectures", {
    multipart: { title, durationMs: "40000", classId, media: { name: "lecture.wav", mimeType: "audio/wav", buffer: WAV } },
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { lecture: Lecture }).lecture;
}

test("a teacher creates a class, a student joins with the code and studies the class's lecture", async ({ page, request, browser }) => {
  const className = `Physics ${Date.now().toString(36)}`;
  const lectureTitle = `${className} — Waves`;

  // Teacher: create the class in the UI → a join code.
  const teacher = await browser.newContext({ storageState: STATE.teacher, viewport: { width: 1180, height: 820 } });
  const tpage = await teacher.newPage();
  await tpage.goto("/classes");
  const form = tpage.getByTestId("create-class-form");
  await form.getByRole("textbox").fill(className);
  await form.getByRole("button").click();
  const card = tpage.getByTestId("class-card").filter({ hasText: className });
  await expect(card).toBeVisible();
  const code = (await card.getByTestId("join-code").innerText()).replace(/[\s-]/g, "");
  expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
  const { classes } = (await (await teacher.request.get("/api/classes")).json()) as { classes: Array<{ id: string; name: string; joinCode: string }> };
  const cls = classes.find((c) => c.name === className)!;
  expect(cls.joinCode).toBe(code);

  // Student (this project's state): a join link only asks; the button enrolls.
  const before = (await (await request.get("/api/classes")).json()) as { classes: Array<{ id: string }> };
  expect(before.classes.map((c) => c.id)).not.toContain(cls.id);
  await page.goto(`/join/${code}`);
  await expect(page.getByTestId("join-class-button")).toHaveText(`Join ${className}`);
  const notYet = (await (await request.get("/api/classes")).json()) as { classes: Array<{ id: string }> };
  expect(notYet.classes.map((c) => c.id)).not.toContain(cls.id);
  await page.getByTestId("join-class-button").click();
  await expect(page.getByTestId("student-class").filter({ hasText: className })).toBeVisible();

  // The teacher's roster counts the student.
  await tpage.reload();
  await expect(tpage.getByTestId("class-card").filter({ hasText: className }).getByTestId("class-roster-count")).toHaveAttribute("data-count", "1");

  // The teacher adds a lecture to the class → it shows up in the student's picker, under the class.
  const lecture = await uploadToClass(teacher.request, lectureTitle, cls.id);
  expect(lecture.classId).toBe(cls.id);
  await page.goto("/app");
  const option = page.locator(`[data-testid="lecture-picker"] optgroup[label="${className}"] option`, { hasText: lectureTitle });
  await expect(option).toHaveCount(1);
  await expect(option).toHaveAttribute("value", lecture.id);
  expect((await request.get(`/api/lectures/${lecture.id}/media`)).status()).toBe(200);
  const started = await request.post("/api/sessions", { data: { title: "Class notes", lectureId: lecture.id } });
  expect(started.status()).toBe(201);

  // A student who isn't in the class: no lecture, no recording, no session on it.
  const outsider = await browser.newContext({ storageState: STATE.studentB });
  expect((await outsider.request.get(`/api/lectures/${lecture.id}/media`)).status()).toBe(404);
  const refused = await outsider.request.post("/api/sessions", { data: { title: "Sneaky", lectureId: lecture.id } });
  expect(refused.status()).toBe(400);
  const { lectures } = (await (await outsider.request.get("/api/lectures")).json()) as { lectures: Lecture[] };
  expect(lectures.map((l) => l.id)).not.toContain(lecture.id);
  const opage = await outsider.newPage();
  await opage.goto("/app");
  await expect(opage.locator(`[data-testid="lecture-picker"] option[value="${lecture.id}"]`)).toHaveCount(0);

  // Teachers can't join classes; an unknown code is 404.
  expect((await teacher.request.post("/api/classes/join", { data: { code } })).status()).toBe(403);
  expect((await outsider.request.post("/api/classes/join", { data: { code: "ZZZZZZZZ" } })).status()).toBe(404);
  // Students can't create classes.
  expect((await request.post("/api/classes", { data: { name: "Mine" } })).status()).toBe(403);

  await outsider.close();
  await teacher.close();
});
