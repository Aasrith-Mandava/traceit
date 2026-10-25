import { expect, test } from "@playwright/test";
import type { TimelineData } from "../lib/types";
import { STATE } from "./accounts";
import { buildPhase2Scenario } from "./fixtures/phase2-scenario";

// Every session is its owner's alone: another signed-in student gets the same 404 as for an id that
// doesn't exist — on the pages and on every session / moment API — and never sees it listed.

test("another student gets 404 on my session, its pages and its moments", async ({ request, browser }) => {
  // Student A (this project's state): a session with ink, analysed → moments.
  const created = await request.post("/api/sessions", { data: { title: "A's private notes" } });
  expect(created.status()).toBe(201);
  const { session } = (await created.json()) as { session: { id: string } };
  const { strokes, eraseEvents } = buildPhase2Scenario(session.id);
  expect((await request.post(`/api/sessions/${session.id}/strokes`, { data: { strokes, eraseEvents } })).status()).toBe(200);
  expect((await request.post(`/api/sessions/${session.id}/analyze`)).status()).toBe(200);
  const timeline = (await (await request.get(`/api/sessions/${session.id}/timeline`)).json()) as TimelineData;
  expect(timeline.events.length).toBeGreaterThan(0);
  const eventId = timeline.events[0].id;

  // Student B.
  const other = await browser.newContext({ storageState: STATE.studentB });
  const b = other.request;
  const id = session.id;
  for (const path of [`/api/sessions/${id}`, `/api/sessions/${id}/timeline`, `/api/sessions/${id}/insights`, `/api/sessions/${id}/export`, `/api/sessions/${id}/notability`, `/api/sessions/${id}/notability/file`, `/api/sessions/${id}/ink-stats`]) {
    expect((await b.get(path)).status(), `GET ${path}`).toBe(404);
  }
  expect((await b.post(`/api/sessions/${id}/strokes`, { data: { strokes, eraseEvents } })).status()).toBe(404);
  expect((await b.post(`/api/sessions/${id}/analyze`)).status()).toBe(404);
  expect((await b.post(`/api/sessions/${id}/recap`)).status()).toBe(404);
  // Well-formed bodies, so the ownership check (not input validation) is what answers.
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const bodies: Record<string, object> = { check: { choiceIdx: 0 }, resolve: { action: "self" }, "read-revision": { beforePng: png, afterPng: png } };
  for (const action of ["help", "check", "resolve", "read-revision", "tts"]) {
    const res = await b.post(`/api/events/${eventId}/${action}`, { data: bodies[action] ?? {} });
    expect(res.status(), `POST /api/events/…/${action}`).toBe(404);
  }
  const listed = (await (await b.get("/api/sessions")).json()) as { sessions: Array<{ id: string }> };
  expect(listed.sessions.map((s) => s.id)).not.toContain(id);

  const page = await other.newPage();
  for (const path of [`/review/${id}`, `/session/${id}`, `/compare/${id}`, `/insights/${id}`]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
  await page.goto("/app");
  await expect(page.locator(`a[href="/session/${id}"]`)).toHaveCount(0);
  await other.close();

  // Nothing B tried changed A's session: same ink, same moments.
  const after = (await (await request.get(`/api/sessions/${id}/timeline`)).json()) as TimelineData;
  expect(after.events.map((e) => [e.id, e.type, e.status])).toEqual(timeline.events.map((e) => [e.id, e.type, e.status]));
  expect((await request.get(`/api/sessions/${id}`)).status()).toBe(200);
});
