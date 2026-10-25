import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { TimelineData } from "../lib/types";
import { buildPhase2Scenario } from "./fixtures/phase2-scenario";

// Making the review easy to open and follow: Study mode opens the most important moment by itself
// and walks through the rest (‹ 1 of 2 ›, Next moment, All caught up), Download PDF, the labelled
// Back, and the writing screen's "Press ▶" hint.

test.use({ viewport: { width: 1180, height: 820 } });

/** A session with the Phase 2 scenario: a correction at 02:30 and an open gap at 03:40. */
async function seeded(request: APIRequestContext, title: string, { analyze = true } = {}) {
  const created = await request.post("/api/sessions", { data: { title } });
  expect(created.status()).toBe(201);
  const { session } = (await created.json()) as { session: { id: string } };
  const { strokes, eraseEvents } = buildPhase2Scenario(session.id);
  expect((await request.post(`/api/sessions/${session.id}/strokes`, { data: { strokes, eraseEvents } })).status()).toBe(200);
  if (!analyze) return { sessionId: session.id, analysis: null };
  const res = await request.post(`/api/sessions/${session.id}/analyze`);
  expect(res.status()).toBe(200);
  const analysis = (await res.json()) as TimelineData;
  expect(analysis.events.map((e) => [e.type, e.status])).toEqual([
    ["misconception_corrected", "resolved"],
    ["unresolved_gap", "open"],
  ]);
  return { sessionId: session.id, analysis };
}

const marker = (page: Page, eventId: string) => page.locator(`[data-testid="timeline-marker"][data-event-id="${eventId}"]`);
const focusInPanel = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('aside[aria-label="Moment details"]'));

test("guided review: the top moment opens by itself; ‹ 1 of 2 › and Next moment walk through; All caught up closes", async ({
  page,
  request,
}) => {
  const { sessionId, analysis } = await seeded(request, "Guided review");
  const [corrected, gap] = analysis!.events;
  await page.goto(`/review/${sessionId}`);
  const detail = page.getByTestId("moment-detail");
  const position = page.getByTestId("moment-position");
  const prev = page.getByTestId("moment-prev");
  const next = page.getByTestId("moment-next");
  const onward = page.getByTestId("moment-continue");

  // Arrival: the open gap — most important — is open and selected on the trail; focus didn't move.
  await expect(detail).toHaveAttribute("data-event-id", gap.id);
  await expect(marker(page, gap.id)).toHaveAttribute("aria-pressed", "true");
  await expect(marker(page, corrected.id)).toHaveAttribute("aria-pressed", "false");
  await expect(position).toHaveText("Moment 1 of 2");
  await expect(position).toHaveAttribute("aria-live", "polite");
  await expect(prev).toHaveAccessibleName("Previous moment");
  await expect(next).toHaveAccessibleName("Next moment");
  await expect(prev).toBeDisabled();
  await expect(next).toBeEnabled();
  for (const button of [prev, next]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await focusInPanel(page)).toBe(false);
  await expect(page.getByTestId("timeline-hint")).toHaveText("Tap a marker to jump to it");
  // The summary chips stay plain counts.
  await expect(page.getByRole("list", { name: "Session summary" }).getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("count-gaps")).toHaveText("1");

  // "Next moment" at the bottom of the moment.
  await expect(onward).toHaveText("Next moment");
  await onward.click();
  await expect(detail).toHaveAttribute("data-event-id", corrected.id);
  await expect(position).toHaveText("Moment 2 of 2");
  await expect(marker(page, corrected.id)).toHaveAttribute("aria-pressed", "true");
  await expect(marker(page, gap.id)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("moment-title")).toBeFocused(); // the student moved: focus follows
  await expect(next).toBeDisabled();
  await expect(prev).toBeEnabled();

  // ‹ / ›, and ← / → while focus is in the panel.
  await prev.click();
  await expect(detail).toHaveAttribute("data-event-id", gap.id);
  await expect(position).toHaveText("Moment 1 of 2");
  await expect(page.getByTestId("moment-title")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(detail).toHaveAttribute("data-event-id", corrected.id);
  await page.keyboard.press("ArrowLeft");
  await expect(detail).toHaveAttribute("data-event-id", gap.id);
  await page.keyboard.press("ArrowLeft"); // already first: nothing happens
  await expect(position).toHaveText("Moment 1 of 2");
  await next.click();
  await expect(detail).toHaveAttribute("data-event-id", corrected.id);

  // The last moment: "All caught up" closes the panel, focus returns to its marker (as Escape does),
  // and the trail offers the way back to My notes.
  await expect(onward).toHaveText("All caught up");
  await onward.click();
  await expect(detail).toHaveCount(0);
  await expect(marker(page, corrected.id)).toBeFocused();
  await expect(page.getByTestId("caught-up")).toContainText("All caught up");
  const home = page.getByTestId("caught-up-home");
  await expect(home).toHaveText("Back to my notes");
  await expect(home).toHaveAttribute("href", "/app");
  // Closed stays closed.
  await page.waitForTimeout(500);
  await expect(detail).toHaveCount(0);

  // Opening a moment again (from its marker) puts the note away; Escape closes it for good.
  await marker(page, gap.id).click();
  await expect(detail).toHaveAttribute("data-event-id", gap.id);
  await expect(page.getByTestId("caught-up")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(marker(page, gap.id)).toBeFocused();
  await page.waitForTimeout(500);
  await expect(detail).toHaveCount(0);

  await page.getByTestId("timeline-marker").first().click();
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "Close moment details" }).click();
  await expect(detail).toHaveCount(0);
});

test("a session analysed on arrival opens its top moment once the analysis lands, without taking focus", async ({
  page,
  request,
}) => {
  const { sessionId } = await seeded(request, "Guided — analysed on arrival", { analyze: false });
  await page.goto(`/review/${sessionId}`);
  await expect(page.getByTestId("timeline")).toHaveAttribute("data-status", "ready");
  await expect(page.getByTestId("moment-detail")).toHaveAttribute("data-type", "unresolved_gap");
  await expect(page.getByTestId("moment-position")).toHaveText("Moment 1 of 2");
  expect(await focusInPanel(page)).toBe(false);
});

test("Study mode: Download PDF (the export) replaces Compare with Notability", async ({ page, request }) => {
  const { sessionId } = await seeded(request, "Guided — download");
  await page.goto(`/review/${sessionId}`);
  const pdf = page.getByTestId("download-pdf");
  await expect(pdf).toHaveAttribute("href", `/api/sessions/${sessionId}/export`);
  await expect(pdf).toHaveAttribute("download", "");
  await expect(pdf).toHaveAccessibleName("Download PDF");
  await expect(pdf).toBeVisible();
  await expect(page.getByTestId("compare-link")).toHaveCount(0);
  await expect(page.locator('a[href*="/compare/"]')).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent("download"), pdf.click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const res = await request.get(`/api/sessions/${sessionId}/export`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("the labelled Back returns to where the student came from, else My notes; after Finish & review, to the writing screen", async ({
  page,
  request,
}) => {
  const { sessionId } = await seeded(request, "Guided — back");
  const back = page.getByTestId("back-link");

  // My progress → a moment → Back: My progress again.
  await page.goto("/progress");
  await page.getByTestId("progress-thread").first().click();
  await page.waitForURL(/\/review\/[^/?]+\?moment=/);
  await expect(back).toHaveAccessibleName("Back");
  await expect(back).toHaveText("Back");
  const box = (await back.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await page.waitForURL(/\/progress$/);

  // Opened directly (nothing in the app came before): My notes.
  await page.goto(`/review/${sessionId}`);
  await back.click();
  await page.waitForURL(/\/app$/);

  // My notes → the notebook → write a line → Finish & review → Back: the writing screen, with every
  // stroke (including the one just written). Back again: My notes, not Study mode.
  await page.locator(`a[data-testid="session-link"][href="/session/${sessionId}"]`).click();
  await page.waitForURL(new RegExp(`/session/${sessionId}$`));
  const canvas = page.getByTestId("ink-canvas");
  await expect(canvas).toHaveAttribute("data-stroke-count", /^[1-9]\d*$/);
  const seededCount = Number(await canvas.getAttribute("data-stroke-count"));
  const c = (await canvas.boundingBox())!;
  await page.mouse.move(c.x + 80, c.y + 420);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(c.x + 80 + i * 12, c.y + 420 + 5 * Math.sin(i));
  await page.mouse.up();
  const written = String(seededCount + 1);
  await expect(canvas).toHaveAttribute("data-stroke-count", written);
  await page.getByTestId("end-session").click();
  await page.waitForURL(new RegExp(`/review/${sessionId}$`));
  await expect(page.getByRole("link", { name: "Keep writing" })).toHaveAttribute("href", `/session/${sessionId}`);
  await back.click();
  await page.waitForURL(new RegExp(`/session/${sessionId}$`));
  await expect(canvas).toHaveAttribute("data-stroke-count", written);
  await back.click();
  await page.waitForURL(/\/app$/);

  // The browser's own back from Study mode lands on the writing screen too.
  await page.locator(`a[data-testid="session-link"][href="/session/${sessionId}"]`).click();
  await page.waitForURL(new RegExp(`/session/${sessionId}$`));
  await page.getByTestId("end-session").click();
  await page.waitForURL(new RegExp(`/review/${sessionId}$`));
  await page.goBack();
  await page.waitForURL(new RegExp(`/session/${sessionId}$`));
  await expect(canvas).toHaveAttribute("data-stroke-count", written);

  // Done: the way out of Study mode, to My notes.
  await page.goForward();
  await page.waitForURL(new RegExp(`/review/${sessionId}$`));
  const done = page.getByTestId("study-done");
  await expect(done).toHaveAccessibleName("Done");
  await expect(done).toHaveAttribute("href", "/app");
  const doneBox = (await done.boundingBox())!;
  // min-h-11 (44px); the box can come back as 43.999999 from sub-pixel layout.
  expect(Math.round(doneBox.height)).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("download-pdf")).toBeVisible();
  await expect(page.getByRole("link", { name: "Keep writing" })).toBeVisible();
  await done.click();
  await page.waitForURL(/\/app$/);
});

test("Study mode on a phone: Done stays visible beside Download PDF and Keep writing", async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const { sessionId } = await seeded(request, "Guided — done on a phone");
  await page.goto(`/review/${sessionId}`);
  const done = page.getByTestId("study-done");
  await expect(done).toBeVisible();
  await expect(done).toBeInViewport({ ratio: 1 });
  const box = (await done.boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("download-pdf")).toBeVisible();
  await expect(page.getByRole("link", { name: "Keep writing" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("capture: while paused the band says “Press ▶” (before writing, and after writing while paused) without moving the page", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await request.post("/api/sessions", { data: { title: "Press play" } });
  const { session } = (await created.json()) as { session: { id: string } };
  await page.goto(`/session/${session.id}`);
  const hint = page.getByTestId("play-hint");
  const toggle = page.getByTestId("play-toggle");
  const canvas = page.getByTestId("ink-canvas");
  const band = page.locator('section[aria-label="Lecture"]');

  // Nothing written yet, paused: the hint is up, inside the band (never over the page).
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Press ▶");
  await expect(hint).toContainText("— your notes are timed to the lecture.");
  await expect(toggle).toHaveAccessibleDescription("Press play — your notes are timed to the lecture.");
  const pageTop = (await canvas.boundingBox())!.y;
  const bandBox = (await band.boundingBox())!;
  const hintBox = (await hint.boundingBox())!;
  expect(hintBox.y).toBeGreaterThanOrEqual(bandBox.y);
  expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(bandBox.y + bandBox.height);
  expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(pageTop);

  const draw = async (y: number) => {
    const c = (await canvas.boundingBox())!;
    await page.mouse.move(c.x + 60, c.y + y);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) await page.mouse.move(c.x + 60 + i * 12, c.y + y + 5 * Math.sin(i));
    await page.mouse.up();
  };

  // Playing: gone, and the page didn't move.
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "playing");
  await expect(hint).toHaveCount(0);
  expect((await canvas.boundingBox())!.y).toBe(pageTop);
  expect((await band.boundingBox())!.height).toBe(bandBox.height);

  // Paused again before writing anything: back.
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "paused");
  await expect(hint).toBeVisible();

  // Written while paused: it stays up.
  await draw(120);
  await expect(canvas).toHaveAttribute("data-stroke-count", "1");
  await expect(hint).toBeVisible();

  // Writing while it plays, then pausing: no hint (the notes are following the lecture).
  await toggle.click();
  await expect(hint).toHaveCount(0);
  await draw(200);
  await expect(canvas).toHaveAttribute("data-stroke-count", "2");
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-state", "paused");
  await expect(hint).toHaveCount(0);

  // Writing while paused again: back, still without moving the page.
  await draw(280);
  await expect(canvas).toHaveAttribute("data-stroke-count", "3");
  await expect(hint).toBeVisible();
  expect((await canvas.boundingBox())!.y).toBe(pageTop);
  expect((await band.boundingBox())!.height).toBe(bandBox.height);
});
