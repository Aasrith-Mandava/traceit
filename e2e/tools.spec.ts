import { expect, test, type Page } from "@playwright/test";
import type { Stroke } from "../lib/types";

// Pen sizes (Fine / Medium / Bold) are saved per stroke and redrawn identically after a reload;
// eraser sizes (Small / Large) set how wide a band one pass rubs out. The "messy = progress" note
// is a faint hint on an empty writing page, no longer a card in the desk sidebar.

async function newSession(page: Page) {
  await page.goto("/app");
  await page.getByTestId("new-session").click();
  await page.waitForURL(/\/session\/[^/]+$/);
  const sessionId = page.url().split("/session/")[1];
  const canvas = page.getByTestId("ink-canvas");
  await expect(canvas).toHaveAttribute("width", /^(?!1$)\d+$/); // sized (ResizeObserver fired)
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  return { sessionId, box };
}

async function drawStraight(page: Page, x0: number, y: number, x1: number) {
  await page.mouse.move(x0, y);
  await page.mouse.down();
  await page.mouse.move(x1, y, { steps: 20 });
  await page.mouse.up();
}

/** One eraser pass straight down across (x, y). */
async function erasePass(page: Page, x: number, y: number) {
  await page.mouse.move(x, y - 40);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 12 });
  await page.mouse.up();
}

/** Dark-ink pixels in a CSS-px rectangle centred on (cx, cy) of the note canvas. */
async function inkPixels(page: Page, cx: number, cy: number, halfW: number, halfH: number) {
  return page.getByTestId("ink-canvas").evaluate(
    (el, [cx, cy, hw, hh]) => {
      const c = el as HTMLCanvasElement;
      const k = c.width / c.clientWidth;
      const [w, h] = [Math.round(2 * hw * k), Math.round(2 * hh * k)];
      if (w <= 0 || h <= 0) return 0;
      const data = c.getContext("2d")!.getImageData(Math.round((cx - hw) * k), Math.round((cy - hh) * k), w, h).data;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 60 && data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 140) n++;
      }
      return n;
    },
    [cx, cy, halfW, halfH] as const,
  );
}

async function storedStrokes(page: Page, sessionId: string): Promise<Stroke[]> {
  const res = await page.request.get(`/api/sessions/${sessionId}`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { strokes: Stroke[] }).strokes;
}

test("a Bold stroke is thicker than a Fine one, and both keep their size after a reload", async ({ page }) => {
  const { sessionId, box } = await newSession(page);

  // Pen sizes show next to the active tool; Medium (today's look) is the default.
  const picker = page.getByRole("radiogroup", { name: "Pen size" });
  await expect(picker).toBeVisible();
  await expect(page.getByTestId("pen-size-medium")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Fine" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("eraser-size-small")).toHaveCount(0);

  await page.getByTestId("pen-size-fine").click();
  await expect(page.getByTestId("pen-size-fine")).toHaveAttribute("aria-checked", "true");
  await drawStraight(page, box.x + 100, box.y + 160, box.x + 400);
  await page.getByTestId("pen-size-bold").click();
  await drawStraight(page, box.x + 100, box.y + 260, box.x + 400);
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-visible-count", "2");

  const fine = await inkPixels(page, 250, 160, 100, 10);
  const bold = await inkPixels(page, 250, 260, 100, 10);
  expect(fine).toBeGreaterThan(50);
  expect(bold).toBeGreaterThan(fine * 2);

  // Saved with each stroke.
  await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 10_000 });
  const sizes = (await storedStrokes(page, sessionId)).map((s) => s.size).sort();
  expect(sizes).toEqual([0.6, 2]);

  // Redrawn identically after a reload; the pen size choice is remembered on this device.
  await page.reload();
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-visible-count", "2");
  await expect.poll(() => inkPixels(page, 250, 160, 100, 10)).toBe(fine);
  await expect.poll(() => inkPixels(page, 250, 260, 100, 10)).toBe(bold);
  await expect(page.getByTestId("pen-size-bold")).toHaveAttribute("aria-checked", "true");

  // Arrow keys move through the sizes (a radiogroup).
  await page.getByTestId("pen-size-bold").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("pen-size-medium")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("pen-size-medium")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("pen-size-fine")).toHaveAttribute("aria-checked", "true");
});

test("a Large eraser rubs out a wider band than a Small one", async ({ page }) => {
  const { sessionId, box } = await newSession(page);
  await drawStraight(page, box.x + 100, box.y + 160, box.x + 400);
  await drawStraight(page, box.x + 100, box.y + 260, box.x + 400);
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-visible-count", "2");
  const before = await inkPixels(page, 250, 160, 60, 6);

  await page.getByTestId("tool-eraser").click();
  const eraserPicker = page.getByRole("radiogroup", { name: "Eraser size" });
  await expect(eraserPicker).toBeVisible();
  await expect(page.getByTestId("pen-size-medium")).toHaveCount(0);
  await expect(page.getByTestId("eraser-size-small")).toHaveAttribute("aria-checked", "true");

  // Small eraser across the top line, Large across the bottom one, at the same x.
  await erasePass(page, box.x + 250, box.y + 160);
  await page.getByTestId("eraser-size-large").click();
  await expect(page.getByTestId("eraser-size-large")).toHaveAttribute("aria-checked", "true");
  await erasePass(page, box.x + 250, box.y + 260);
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-erased-count", "2");

  const leftSmall = await inkPixels(page, 250, 160, 60, 6);
  const leftLarge = await inkPixels(page, 250, 260, 60, 6);
  expect(leftSmall).toBeLessThan(before);
  // Gap ≈ 2 × radius: about 24 px for Small, 56 px for Large, in a 120 px window.
  expect(before - leftLarge).toBeGreaterThan((before - leftSmall) * 1.8);

  // The erased pieces show the same: the Large one spans a much wider stretch of the line.
  await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 10_000 });
  const ghosts = (await storedStrokes(page, sessionId)).filter((s) => s.erased && s.splitFrom);
  expect(ghosts).toHaveLength(2);
  const [small, large] = ghosts.sort((a, b) => a.bbox[1] - b.bbox[1]).map((s) => s.bbox[2] - s.bbox[0]);
  expect(large).toBeGreaterThan(small * 1.8);

  // The eraser size is remembered on this device too.
  await page.reload();
  await page.getByTestId("tool-eraser").click();
  await expect(page.getByTestId("eraser-size-large")).toHaveAttribute("aria-checked", "true");
});

test("an empty page shows the faint 'messy = progress' hint until the first stroke", async ({ page }) => {
  await newSession(page);
  const hint = page.getByTestId("capture-empty-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText("messy = progress. Scribble boldly. Every crossed-out line stays as a faint ghost.");
  await expect(hint).toHaveAttribute("aria-hidden", "true");
  await expect(hint).toHaveCSS("pointer-events", "none");

  // Drawing right over the hint still lands on the page; the hint goes with the first stroke.
  const hb = (await hint.boundingBox())!;
  await drawStraight(page, hb.x + 20, hb.y + hb.height / 2, hb.x + 160);
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-visible-count", "1");
  await expect(hint).toHaveCount(0);

  // A session with notes never shows it (even after undo leaves only erased ink).
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-visible-count", "0");
  await expect(hint).toHaveCount(0);
  await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("ink-canvas")).toHaveAttribute("data-stroke-count", "1");
  await expect(hint).toHaveCount(0);
});

test("the desk sidebar no longer carries the 'messy = progress' card", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("new-session")).toBeVisible();
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.getByText("messy = progress")).toHaveCount(0);
});

test("the size control fits a 390px phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await newSession(page);
  for (const id of ["pen-size-fine", "pen-size-medium", "pen-size-bold"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
  }
  await page.getByTestId("tool-eraser").click();
  await expect(page.getByTestId("eraser-size-large")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
