import { ownedLecture } from "@/lib/access";
import { withUser } from "@/lib/auth/core";
import { getDb } from "@/lib/db";
import { readJsonBody, sameOriginOnly } from "@/lib/http";
import {
  LIVE_DEMO_MESSAGE,
  MAX_CUES_BODY_BYTES,
  MAX_LIVE_WORDS,
  liveLectureDisabled,
  mergeLiveWords,
  parseCueBatch,
} from "@/lib/liveLecture";
import { createKeyedMutex } from "@/lib/mutex";

/** One writer per lecture: each batch is a read-merge-write of the transcript. */
const lectureMutex = createKeyedMutex();

/**
 * Appends a batch of Live lecture transcript cues: `{ cues: [{ startMs, endMs, text }], durationMs? }`
 * on the session clock. Idempotent (see mergeLiveWords): a retried batch replaces, never duplicates.
 * The words become the lecture's transcript, so everything downstream reads them unchanged.
 */
export const POST = sameOriginOnly(withUser(async (request, user, ctx: { params: Promise<{ id: string }> }) => {
  if (liveLectureDisabled(process.env)) return Response.json({ error: LIVE_DEMO_MESSAGE }, { status: 403 });
  const { id } = await ctx.params;
  const read = await readJsonBody(request, MAX_CUES_BODY_BYTES);
  if (!read.ok) return read.response;
  const parsed = parseCueBatch(read.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { cues, durationMs } = parsed.value;

  return lectureMutex.run(id, async () => {
    // Only the lecture's owner (who is taking it live) adds to its transcript.
    const record = await ownedLecture(user, id);
    if (!record) return Response.json({ error: "lecture not found" }, { status: 404 });
    if (record.lecture.transcriptSource !== "live") {
      return Response.json({ error: "Only a Live lecture takes live transcript cues." }, { status: 409 });
    }
    const db = getDb();
    const words = mergeLiveWords(record.words, cues);
    if (words.length > MAX_LIVE_WORDS) return Response.json({ error: "The transcript is full." }, { status: 413 });
    if (cues.length > 0) await db.setLectureTranscript(id, words, "live");
    const length = Math.max(record.lecture.durationMs, durationMs ?? 0, words.at(-1)?.endMs ?? 0);
    const lecture =
      length !== record.lecture.durationMs ? await db.setLectureMedia(id, { durationMs: length }) : (await db.getLecture(id))!.lecture;
    return Response.json({ lecture, wordCount: words.length });
  });
}));
