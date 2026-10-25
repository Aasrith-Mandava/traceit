import { expect, test, type Page } from "@playwright/test";

const SECTIONS = ["top", "demo", "try", "how", "features", "audiences", "privacy", "faq"];
const HEADLINE = "Your eraser is hiding the good stuff.";
const APP_HREF = process.env.NEXT_PUBLIC_APP_URL || "/app";
/** "See it in the demo" on the offline-demo build (DEMO_MODE=1, seeded): Maya's first review. */
const DEMO_HREF = "/review/demo-maya-1";
const NAV = ["#how", "#features", "#audiences", "#faq"];
const HACKATHON = /hack\s?gt|hackathon/i;
/** The flat lavender desk html paints behind the whole page (--color-desk #f3f2fb). */
const DESK = "rgb(243, 242, 251)";
/**
 * Section titles with the drawn-in highlighter swipe, in page order. The dark "idea" band
 * hand-letters its key word instead, the final CTA uses a static highlight and "Who it's for" is
 * screen-reader only.
 */
const MARKED_TITLES = ["demo-title", "try-title", "features-title", "privacy-title", "faq-title"];

/** Console errors and uncaught exceptions collected over a page's life. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Record every WebGL context request, on any canvas or OffscreenCanvas, attached or not (probes
 * count too) and whether or not it succeeds.
 */
async function trackWebGL(page: Page) {
  await page.addInitScript(() => {
    const requests: string[] = [];
    (window as unknown as { __glRequests: string[] }).__glRequests = requests;
    const protos = [HTMLCanvasElement.prototype, typeof OffscreenCanvas === "undefined" ? null : OffscreenCanvas.prototype];
    for (const proto of protos) {
      if (!proto) continue;
      const orig = proto.getContext as (...a: unknown[]) => unknown;
      Object.defineProperty(proto, "getContext", {
        configurable: true,
        value(this: unknown, type: string, ...rest: unknown[]) {
          if (/webgl/i.test(type)) requests.push(type);
          return orig.call(this, type, ...rest);
        },
      });
    }
  });
  return () => page.evaluate(() => (window as unknown as { __glRequests: string[] }).__glRequests.length);
}

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
}

const launcher = (page: Page) => page.locator('button[aria-controls="ask-traceit"]');

test("light hero, sections, nav, CTAs, video and meta", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/welcome");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
  await expect(page).toHaveTitle("TraceIt — Study notes that learn from your mistakes");
  const badge = page.locator("#top").getByText("Study notes that learn from your mistakes");
  await expect(badge).toBeVisible();
  await expect(badge.getByText("NEW", { exact: true })).toBeVisible();

  // Light theme: html paints the flat lavender desk behind everything; the old liquid-metal page
  // layer (WebGL with a CSS fallback) is gone, so nothing else paints the page background.
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f3f2fb");
  expect(
    await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return [s.backgroundColor, s.backgroundImage];
    }),
  ).toEqual([DESK, "none"]);
  await expect(page.locator("[data-page-bg], [data-liquid-metal]")).toHaveCount(0);

  for (const id of SECTIONS) await expect(page.locator(`section#${id}`)).toHaveCount(1);

  const hrefs = await page
    .locator('header nav[aria-label="Primary"] a')
    .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(NAV);

  // Into the app from the header, the hero and the final CTA.
  await expect(page.locator("header").getByRole("link", { name: "Launch TraceIt" })).toHaveAttribute("href", APP_HREF);
  await expect(page.locator("#top").getByRole("link", { name: "Try the live demo" })).toHaveAttribute("href", APP_HREF);
  await expect(
    page.locator('section[aria-labelledby="cta-title"]').getByRole("link", { name: "Launch TraceIt" }),
  ).toHaveAttribute("href", APP_HREF);
  const appLinks = page.getByRole("link", { name: /^(Launch TraceIt|Try the live demo)$/ });
  expect(await appLinks.count()).toBeGreaterThanOrEqual(3); // header, hero, final CTA
  for (const href of await appLinks.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(href).toBe(APP_HREF);

  // Video: click-to-play, never autoplay.
  const video = page.locator("#demo video");
  await expect(video).toHaveAttribute("poster", "/traceit-demo-poster.jpg");
  await expect(video).toHaveAttribute("preload", "metadata");
  await page.getByRole("link", { name: "See it in action" }).first().click();
  await expect(page).toHaveURL(/#demo$/);
  await page.getByRole("button", { name: /Play the demo video/ }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
  await video.evaluate((v: HTMLVideoElement) => v.pause());

  // No attributions column in the footer; the lecture-footage credit sits under the video.
  const footer = page.locator("footer");
  await expect(footer.getByText(/Attributions/)).toHaveCount(0);
  await expect(footer.getByText(/Paper Shaders/)).toHaveCount(0);
  await expect(page.locator("#demo").getByText(/MIT OpenCourseWare 18\.01/)).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/traceit-demo-poster\.jpg$/);

  await page.waitForTimeout(400);
  expect(errors).toEqual([]);
});

test("no hackathon wording anywhere (visible text, HTML, meta)", async ({ page }) => {
  await page.goto("/welcome");
  await scrollThrough(page);
  expect(await page.locator("body").innerText()).not.toMatch(HACKATHON);
  expect(await page.content()).not.toMatch(HACKATHON);
  const res = await page.request.get("/welcome");
  expect(await res.text()).not.toMatch(HACKATHON);
});

test("no WebGL contexts are created on the landing page, even after scrolling the whole page", async ({ page }) => {
  const requests = await trackWebGL(page);
  await page.goto("/welcome");
  await page.waitForTimeout(1200);
  await scrollThrough(page);
  await page.waitForTimeout(800);
  expect(await requests()).toBe(0);
  // No liquid-metal surfaces of either kind; the one canvas left is Try it's 2D drawing area.
  await expect(page.locator("[data-liquid-metal]")).toHaveCount(0);
  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(1);
  await expect(canvases).toHaveAttribute("data-testid", "tryit-canvas");
});

test("one continuous background: every section and the footer are transparent", async ({ page }) => {
  await page.goto("/welcome");
  const ids = [...SECTIONS.map((id) => `section#${id}`), 'section[aria-labelledby="cta-title"]', "footer", "main", "body"];
  for (const sel of ids) {
    const [color, image] = await page
      .locator(sel)
      .first()
      .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).backgroundImage]);
    expect(color, sel).toBe("rgba(0, 0, 0, 0)");
    expect(image, sel).toBe("none");
  }
  // The tech list ("Built with") and the Tiger Data hotspot line were taken off the page on request.
  await expect(page.getByRole("heading", { name: "Built with" })).toHaveCount(0);
  await expect(page.getByText("TimescaleDB continuous aggregate")).toHaveCount(0);
});

test("Ask TraceIt: opens, answers a starter question offline, traps focus, Esc closes", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/welcome");
  await launcher(page).click();
  const dialog = page.getByRole("dialog", { name: "Ask TraceIt" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Ask a question about TraceIt" })).toBeFocused();

  await dialog.getByRole("button", { name: "Is my data private?" }).click();
  const answer = dialog.locator('[data-role="assistant"][data-status="done"]').last();
  await expect(answer).toContainText("local-first");
  await expect(dialog.getByTestId("offline-label")).toBeVisible();
  await expect(page.locator('[role="status"][aria-live="polite"]').filter({ hasText: "TraceIt:" })).toHaveCount(1);

  // Typed question + Enter.
  const box = dialog.getByRole("textbox", { name: "Ask a question about TraceIt" });
  await box.fill("Which languages?");
  await box.press("Enter");
  await expect(dialog.locator('[data-role="assistant"][data-status="done"]').last()).toContainText("Telugu");

  // Focus stays inside the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(launcher(page)).toBeFocused();

  // Reopening keeps the conversation.
  await launcher(page).click();
  await expect(page.getByRole("dialog").locator('[data-role="assistant"]')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("the FAQ's Ask button opens the assistant", async ({ page }) => {
  await page.goto("/welcome#faq");
  await page.locator("#faq").getByRole("button", { name: "Ask TraceIt" }).click();
  await expect(page.getByRole("dialog", { name: "Ask TraceIt" })).toBeVisible();
});

test("/api/ask: same-origin only, size limits, offline fallback", async ({ request, baseURL }) => {
  const url = "/api/ask";
  const json = { "content-type": "application/json" };

  const cross = await request.post(url, { headers: { ...json, origin: "https://evil.example" }, data: { message: "hi" } });
  expect(cross.status()).toBe(403);
  const noOrigin = await request.post(url, { headers: json, data: { message: "hi" } });
  expect(noOrigin.status()).toBe(403);

  const big = await request.post(url, {
    headers: { ...json, origin: baseURL! },
    data: JSON.stringify({ message: "x".repeat(3000) }),
  });
  expect(big.status()).toBe(413);

  const long = await request.post(url, { headers: { ...json, origin: baseURL! }, data: { message: "a".repeat(501) } });
  expect(long.status()).toBe(400);

  const get = await request.get(url);
  expect(get.status()).toBe(405);

  const ok = await request.post(url, {
    headers: { ...json, origin: baseURL! },
    data: { message: "Does it work with Notability?" },
  });
  expect(ok.status()).toBe(200);
  expect(ok.headers()["x-answer-source"]).toBe("offline");
  expect(ok.headers()["cache-control"]).toBe("no-store");
  expect(await ok.text()).toMatch(/Notability/);

  const offTopic = await request.post(url, { headers: { ...json, origin: baseURL! }, data: { message: "best pizza in town?" } });
  expect(await offTopic.text()).toMatch(/^I don't know/);
});

test("Try it: draw, erase to ghost ink, rewrite → you caught your own mistake", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/welcome#try");
  const canvas = page.getByTestId("tryit-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width * 0.45;
  const cy = box.y + box.height * 0.5;

  const scribble = async () => {
    await page.mouse.move(cx - 40, cy);
    await page.mouse.down();
    for (let i = 0; i <= 16; i++) await page.mouse.move(cx - 40 + i * 5, cy + (i % 2 ? -12 : 12));
    await page.mouse.up();
  };

  await scribble();
  const counts = page.locator('dl[aria-label="What TraceIt saw"] dd');
  await expect(counts.nth(0)).toHaveText("1");

  await page.getByRole("button", { name: "Eraser", exact: true, pressed: false }).click();
  await expect(page.getByRole("button", { name: "Eraser", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(cx - 50, cy);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(cx - 50 + i * 5, cy);
  await page.mouse.up();
  await expect(counts.nth(1)).toHaveText("1");
  await expect(page.getByTestId("correction-chip")).toHaveCount(0);

  // Ghost ink is drawn (dashed light-indigo pixels, rgba(139,128,249,.8), remain where the ink was).
  // Blue-dominant over both red and green; the default ink (#1d1a3a) is only ~30 bluer, so it never counts.
  const ghostPixels = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 60) n++;
      return n;
    });
  expect(await ghostPixels()).toBeGreaterThan(20);
  const ghostSwitch = page.getByRole("switch", { name: "Show erased ink" });
  await ghostSwitch.click();
  await expect(ghostSwitch).toHaveAttribute("aria-checked", "false");
  await expect.poll(ghostPixels).toBe(0);
  await ghostSwitch.click();

  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await scribble();
  await expect(page.getByTestId("correction-chip")).toBeVisible();
  await expect(page.getByTestId("correction-chip")).toContainText("You caught your own mistake");
  await expect(counts.nth(2)).toHaveText("1");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(counts.nth(0)).toHaveText("0");
  await expect(page.getByTestId("correction-chip")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Try it: partial eraser splits a stroke; pen size and colour apply", async ({ page }) => {
  await page.goto("/welcome#try");
  const canvas = page.getByTestId("tryit-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const y = box.y + box.height * 0.5;
  const x0 = box.x + box.width * 0.2;

  // Bold red pen via the radio groups (keyboard-operable).
  const sizes = page.getByRole("radiogroup", { name: "Pen size" });
  await sizes.getByRole("radio", { name: "Bold" }).click();
  await expect(sizes.getByRole("radio", { name: "Bold" })).toHaveAttribute("aria-checked", "true");
  const colours = page.getByRole("radiogroup", { name: "Ink colour" });
  await colours.getByRole("radio", { name: "Ink" }).focus();
  await page.keyboard.press("End"); // → Red
  await expect(colours.getByRole("radio", { name: "Red" })).toHaveAttribute("aria-checked", "true");
  await expect(colours.getByRole("radio", { name: "Red" })).toBeFocused();

  // One long horizontal line.
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(x0 + i * 10, y);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-live", "1");
  const redPixels = await canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] > 180 && d[i + 1] < 90) n++;
    return n;
  });
  expect(redPixels).toBeGreaterThan(100);

  // Erase a small hole in the middle: the stroke splits into two live pieces + one ghost piece.
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await expect(page.getByRole("radiogroup", { name: "Eraser size" }).getByRole("radio", { name: "Small" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.mouse.click(x0 + 150, y);
  await expect(canvas).toHaveAttribute("data-live", "2");
  await expect(canvas).toHaveAttribute("data-ghost", "1");

  // Rewrite over the hole → correction.
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.move(x0 + 140, y - 4);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(x0 + 140 + i * 5, y + (i % 2 ? 4 : -4));
  await page.mouse.up();
  await expect(page.getByTestId("correction-chip")).toBeVisible();
});

test("How it works: steps expand only when clicked (click and keyboard)", async ({ page }) => {
  await page.goto("/welcome#how");
  const steps = page.locator("#how button[aria-expanded]");
  await expect(steps).toHaveCount(4);
  // Nothing opens by itself while scrolling.
  await expect(page.locator('#how button[aria-expanded="true"]')).toHaveCount(0);
  await steps.nth(2).click();
  await expect(steps.nth(2)).toHaveAttribute("aria-expanded", "true");
  const detail = page.locator(`#${await steps.nth(2).getAttribute("aria-controls")}`);
  await expect(detail).toBeVisible();
  // Runs against the offline demo (DEMO_MODE=1, seeded), so this deep-links into the demo review.
  await expect(detail.getByRole("link", { name: /See it in the demo/ })).toHaveAttribute("href", DEMO_HREF);
  // Keyboard: the last step, via Enter; only one step is open at a time.
  await steps.nth(3).focus();
  await page.keyboard.press("Enter");
  await expect(steps.nth(3)).toHaveAttribute("aria-expanded", "true");
  await expect(steps.nth(2)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#how").getByRole("link", { name: /See it in the demo/ })).toHaveCount(1);
  // Clicking the open step closes it.
  await steps.nth(3).click();
  await expect(page.locator('#how button[aria-expanded="true"]')).toHaveCount(0);
});

test("feature cards open a detail sheet (click and keyboard), Esc closes and returns focus", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/welcome#features");
  const card = page.locator('[data-feature="ghost"]');
  await card.scrollIntoViewIfNeeded();
  await card.click();
  const sheet = page.getByRole("dialog", { name: "Ghost ink" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Try it in TraceIt/ })).toHaveAttribute("href", APP_HREF);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(card).toBeFocused();

  const notability = page.locator('[data-feature="notability"]');
  await notability.focus();
  await page.keyboard.press("Enter");
  const notabilitySheet = page.getByRole("dialog", { name: "Plays nice with Notability" });
  await expect(notabilitySheet).toBeVisible();
  await expect(notabilitySheet.getByRole("link", { name: /Try it in TraceIt/ })).toHaveAttribute("href", APP_HREF);
  await notabilitySheet.getByRole("button", { name: "Close" }).click();
  await expect(notabilitySheet).toHaveCount(0);
  await expect(notability).toBeFocused();
  expect(errors).toEqual([]);
});

test("Help in your language: picking a chip shows the sample in that language and stops the cycle", async ({ page }) => {
  await page.goto("/welcome#features");
  const group = page.getByRole("radiogroup", { name: "Language for the sample explanation" });
  await group.scrollIntoViewIfNeeded();
  await expect(group.getByRole("radio")).toHaveCount(10);
  await group.getByRole("radio", { name: /Español/ }).click();
  await expect(group.getByRole("radio", { name: /Español/ })).toHaveAttribute("aria-checked", "true");
  const sample = page.getByTestId("language-sample");
  await expect(sample).toHaveAttribute("lang", "es");
  await expect(sample).toContainText("derivada interna");
  await page.waitForTimeout(3200); // longer than one auto-cycle step
  await expect(sample).toHaveAttribute("lang", "es");
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: /हिन्दी/ })).toHaveAttribute("aria-checked", "true");
  await expect(sample).toHaveAttribute("lang", "hi");
  await group.getByRole("radio", { name: /العربية/ }).click();
  await expect(sample).toHaveAttribute("dir", "rtl");
  await group.getByRole("radio", { name: "English" }).click();
  await expect(sample).toContainText("You forgot to multiply by the inner derivative, 2x.");
});

test("section headings are bold with a highlighter swipe that draws in", async ({ page }) => {
  await page.goto("/welcome");
  // Exactly these titles carry a swipe, one each, in page order.
  await expect(page.locator("h2 [data-marker]")).toHaveCount(MARKED_TITLES.length);
  expect(await page.locator("h2:has([data-marker])").evaluateAll((hs) => hs.map((h) => h.id))).toEqual(MARKED_TITLES);
  // The final CTA's key word keeps a (static) highlighter band.
  await expect(page.locator("#cta-title .hl")).toHaveCount(1);
  for (const id of MARKED_TITLES) {
    const h2 = page.locator(`#${id}`);
    expect(Number(await h2.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
    await h2.scrollIntoViewIfNeeded();
    await expect.poll(() => h2.locator("[data-marker]").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(30);
  }
});

test("demo video: bottom-left play pill, no transcript UI, captions track kept", async ({ page }) => {
  await page.goto("/welcome#demo");
  const video = page.locator("#demo video");
  const pill = page.getByRole("button", { name: /Play the demo video/ });
  await expect(pill).toBeVisible();
  const v = (await video.boundingBox())!;
  const p = (await pill.boundingBox())!;
  // Bottom-left corner of the poster, not the centre.
  expect(p.x - v.x).toBeLessThan(40);
  expect(p.y).toBeGreaterThan(v.y + v.height * 0.75);
  expect(p.width).toBeLessThan(v.width / 2);
  await expect(page.getByText("Read the transcript")).toHaveCount(0);
  await expect(page.getByText(/Narrated, with captions/)).toHaveCount(0);
  await expect(page.locator("#demo details")).toHaveCount(0);
  await expect(video.locator("track")).toHaveCount(1);
});

test("FAQ accordion works with the keyboard", async ({ page }) => {
  await page.goto("/welcome#faq");
  const buttons = page.locator("#faq h3 button");
  const first = buttons.nth(0);
  const second = buttons.nth(1);
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`#${await second.getAttribute("aria-controls")}`);
  await expect(panel).toBeVisible();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press(" ");
  await expect(second).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await page.keyboard.press("End");
  await expect(buttons.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
});

test("timeline fills once in view without hijacking scroll", async ({ page }) => {
  await page.goto("/welcome");
  const story = page.locator('[data-story="animated"]');
  await expect(story).toHaveCount(1);
  // A normal-height section: no tall sticky scroll track.
  const { h, vh } = await story.evaluate((el) => ({ h: el.getBoundingClientRect().height, vh: window.innerHeight }));
  expect(h).toBeLessThan(vh * 1.6);
  const gap = page.locator('[data-moment="gap"] > span').first();
  const scaleOf = () => gap.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  expect(await scaleOf()).toBeLessThan(0.5);
  await story.scrollIntoViewIfNeeded();
  await expect.poll(scaleOf, { timeout: 8_000 }).toBeGreaterThan(0.95);
  await expect(page.locator('#how button[aria-expanded="true"]')).toHaveCount(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("static final states, flat static background, no console errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
    await page.waitForTimeout(600);
    // No liquid-metal layer: one flat, unanimated desk colour behind the whole page.
    await expect(page.locator("[data-page-bg], [data-liquid-metal]")).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const s = getComputedStyle(document.documentElement);
        return [s.backgroundColor, s.backgroundImage, s.animationName];
      }),
    ).toEqual([DESK, "none", "none"]);
    // Story is static with every moment shown.
    await expect(page.locator('[data-story="static"]')).toHaveCount(1);
    await expect(page.locator('[data-story="static"] [data-moment]')).toHaveCount(3);
    await expect(page.getByRole("button", { name: /handwriting animation/ })).toHaveCount(0);
    // Highlighter swipes are already drawn.
    await page.locator("#faq-title").scrollIntoViewIfNeeded();
    expect(await page.locator("#faq-title [data-marker]").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(30);
    // Story steps still select (no scrolling) and show their detail.
    const steps = page.locator("#how button[aria-expanded]");
    await steps.nth(0).click();
    await expect(steps.nth(0)).toHaveAttribute("aria-expanded", "true");
    // "Show me" lands on the final state straight away.
    await page.locator("#try").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Show me" }).click();
    await expect(page.getByTestId("correction-chip")).toBeVisible();
    await scrollThrough(page);
    // Nothing on the page loops (CSS or Web Animations) once everything has mounted.
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity).length,
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("no WebGL", () => {
  test("the page never needs WebGL: it renders and Try it draws without errors", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext as (...args: unknown[]) => unknown;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === "webgl2" || type === "webgl") return null;
          return orig.call(this, type, ...rest);
        },
      });
    });
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(HEADLINE);
    await page.waitForTimeout(800);
    await expect(page.locator("#top canvas")).toHaveCount(0);
    // The same flat page background as with WebGL available.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(DESK);
    // Try it is a plain 2D canvas: "Show me" still writes, erases and pairs the correction.
    await page.locator("#try").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Show me" }).click();
    await expect(page.getByTestId("correction-chip")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("mobile 390px", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("no horizontal overflow; hero art and launcher clear of the hero copy; menu and chat work", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/welcome");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1500); // entrances settle

    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    // The decorative notebook page (the hero art that replaced the orb) and the floating launcher.
    const art = (await page.locator('#top > div[aria-hidden="true"]').boundingBox())!;
    const chat = (await launcher(page).boundingBox())!;
    for (const sel of ["#hero-title", '#top a[href="#demo"]', `#top a[href="${APP_HREF}"]`]) {
      const b = (await page.locator(sel).first().boundingBox())!;
      expect(overlaps(art, b), `hero art overlaps ${sel}`).toBe(false);
      expect(overlaps(chat, b), `launcher overlaps ${sel}`).toBe(false);
    }

    await scrollThrough(page);
    // Compare with the device width: under mobile emulation an overflow widens innerWidth too.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);

    await page.evaluate(() => window.scrollTo(0, 0));
    // Escape closes the menu and hands focus back to its button.
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#mobile-menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "What’s inside" }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator("#mobile-menu")).toHaveCount(0);

    await launcher(page).tap();
    const dialog = page.getByRole("dialog", { name: "Ask TraceIt" });
    await expect(dialog).toBeVisible();
    // Full-width sheet on phones (polled: it scales in).
    await expect.poll(async () => (await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(388);
    await dialog.getByRole("button", { name: "Which languages?" }).tap();
    await expect(dialog.locator('[data-role="assistant"][data-status="done"]')).toContainText("Spanish");
    await dialog.getByRole("button", { name: "Close assistant" }).tap();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

// Design screenshots → screenshots/welcome/v3-*.png (gitignored).
test.describe("screenshots", () => {
  const dir = "screenshots/welcome";

  async function shoot(page: Page, prefix: string) {
    await page.goto("/welcome");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${dir}/v3-${prefix}-hero.png` });

    await page.locator("#try").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.getByRole("button", { name: "Show me" }).click();
    await expect(page.getByTestId("correction-chip")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("tryit-canvas").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${dir}/v3-${prefix}-tryit.png` });

    await page.locator("[data-story]").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `${dir}/v3-${prefix}-timeline.png` });

    await page.locator("#features").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${dir}/v3-${prefix}-features.png` });

    await page.locator("#faq").evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500);
    await launcher(page).click();
    const dialog = page.getByRole("dialog", { name: "Ask TraceIt" });
    await dialog.getByRole("button", { name: "How does TraceIt know I'm stuck?" }).click();
    await expect(dialog.locator('[data-role="assistant"][data-status="done"]')).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/v3-${prefix}-chat.png` });

    // The whole page, top to bottom, on its one continuous background.
    await dialog.getByRole("button", { name: "Close assistant" }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/v3-${prefix}-full.png`, fullPage: true });
  }

  test("desktop 1440×900", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await shoot(page, "desktop");
  });

  test("mobile 390×844", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await shoot(page, "mobile");
    await ctx.close();
  });
});
