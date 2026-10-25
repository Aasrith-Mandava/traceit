"use client";

import { useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseCaptions } from "@/lib/captions";
import type { Lecture, LectureMediaType } from "@/lib/types";
import {
  CAPTIONS_ACCEPT,
  MEDIA_ACCEPT,
  checkCaptionsFile,
  checkMediaFile,
  sanitizeTitle,
  titleFromFileName,
} from "@/lib/upload";
import { formatClock } from "./LecturePlayer";
import { CaptionsIcon, CheckIcon, WaveIcon } from "./icons";
import { btnPrimary, btnSecondary } from "./ui";
import { UPLOAD_DEMO_MESSAGE, publicUploadNote } from "@/lib/demoMode";

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * Reads a file's duration with a detached (never shown) media element. Some WebM files report
 * Infinity until the browser has scanned to the end, so those are nudged with a far seek.
 */
function readMediaDuration(file: File, kind: LectureMediaType): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.preload = "metadata";
    el.muted = true;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error("timeout"))), 15_000);
    const accept = () => {
      // Read before finish(): unloading the element resets its duration.
      const seconds = el.duration;
      if (Number.isFinite(seconds) && seconds > 0) finish(() => resolve(Math.round(seconds * 1000)));
    };
    el.addEventListener("loadedmetadata", () => {
      accept();
      if (!settled) el.currentTime = 1e7;
    });
    el.addEventListener("durationchange", accept);
    el.addEventListener("error", () => finish(() => reject(new Error("unplayable"))));
    el.src = url;
  });
}

type MediaState =
  | { status: "empty" }
  | { status: "reading"; file: File; kind: LectureMediaType }
  | { status: "ready"; file: File; kind: LectureMediaType; durationMs: number }
  | { status: "error"; file?: File; error: string };

type CaptionState =
  | { status: "empty" }
  | { status: "ready"; file: File; cues: number }
  | { status: "error"; file: File; error: string };

/**
 * A file picker styled as a dashed-indigo drop zone (like the sidebar's "Upload a lecture"). The input
 * stays in the tab order (visually hidden).
 */
function FileZone({
  label,
  hint,
  accept,
  testId,
  icon,
  onFile,
  children,
  invalid,
}: {
  label: string;
  hint: string;
  accept: string;
  testId: string;
  icon: ReactNode;
  onFile: (file: File | null) => void;
  children?: ReactNode;
  invalid?: boolean;
}) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`group relative flex min-h-[5.25rem] cursor-pointer items-center gap-3.5 rounded-[18px] border-[1.5px] border-dashed px-4 py-4 transition-[background-color,border-color,box-shadow] duration-150 focus-within:shadow-[var(--focus-ring)] ${
        over
          ? "border-accent bg-accent-soft"
          : invalid
            ? "border-danger/50 bg-paper"
            : "border-accent-line bg-accent-tint hover:border-accent hover:bg-accent-soft"
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-white text-accent shadow-raised"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {children ?? (
          <>
            <span className="text-[15px] font-bold text-accent-strong">{label}</span>
            <span className="text-sm text-ink-subtle">{hint}</span>
          </>
        )}
      </span>
      <input
        type="file"
        accept={accept}
        data-testid={testId}
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/**
 * `available` is false in DEMO_MODE (a public demo stores no uploads): the form is shown disabled,
 * with a note, and the server refuses the upload anyway (403). `publicMaxMb` is set when the public
 * demo accepts visitor uploads (DEMO_MODE + PUBLIC_UPLOADS): the form is enabled with that cap and a
 * note that uploads are removed again.
 *
 * `classes` (teachers only): the classes they teach, offered in an "Add to" select (personal by
 * default, or `defaultClassId`); a lecture added to a class is shared with its students.
 */
export default function UploadLectureForm({
  aiConfigured,
  available = true,
  publicMaxMb,
  classes,
  defaultClassId,
}: {
  aiConfigured: boolean;
  available?: boolean;
  publicMaxMb?: number;
  classes?: Array<{ id: string; name: string }>;
  defaultClassId?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(
    defaultClassId && classes?.some((c) => c.id === defaultClassId) ? defaultClassId : "",
  );
  const [media, setMedia] = useState<MediaState>({ status: "empty" });
  const [captions, setCaptions] = useState<CaptionState>({ status: "empty" });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readToken = useRef(0);
  const titleEdited = useRef(false);

  const chooseMedia = async (file: File | null) => {
    setError(null);
    if (!file || !available) return;
    const check = checkMediaFile(file);
    const token = ++readToken.current;
    if (!check.ok) {
      setMedia({ status: "error", file, error: check.error });
      return;
    }
    if (publicMaxMb !== undefined && file.size > publicMaxMb * 1024 * 1024) {
      setMedia({ status: "error", file, error: `On the public demo, recordings can be at most ${publicMaxMb} MB.` });
      return;
    }
    if (!titleEdited.current) setTitle(titleFromFileName(file.name));
    setMedia({ status: "reading", file, kind: check.value.mediaType });
    try {
      const durationMs = await readMediaDuration(file, check.value.mediaType);
      if (token === readToken.current) setMedia({ status: "ready", file, kind: check.value.mediaType, durationMs });
    } catch {
      if (token === readToken.current) {
        setMedia({ status: "error", file, error: "This browser can't play that file, so its length is unknown." });
      }
    }
  };

  const chooseCaptions = async (file: File | null) => {
    setError(null);
    if (!file || !available) return;
    const check = checkCaptionsFile(file);
    if (!check.ok) return setCaptions({ status: "error", file, error: check.error });
    const cues = parseCaptions(await file.text()).length;
    setCaptions(
      cues > 0 ? { status: "ready", file, cues } : { status: "error", file, error: "No captions found in that file." },
    );
  };

  const uploading = progress !== null;
  const canSubmit = available && media.status === "ready" && captions.status !== "error" && !uploading;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!available || media.status !== "ready" || captions.status === "error") return;
    const form = new FormData();
    form.set("title", sanitizeTitle(title, titleFromFileName(media.file.name) || "Untitled lecture"));
    form.set("durationMs", String(media.durationMs));
    form.set("media", media.file);
    if (captions.status === "ready") form.set("captions", captions.file);
    if (classId) form.set("classId", classId);

    // XHR (not fetch) for upload progress on large recordings.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/lectures");
    xhr.responseType = "json";
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(ev.loaded / ev.total);
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { lecture?: Lecture; error?: string };
      if (xhr.status === 201 && body.lecture) {
        setProgress(1);
        router.push(`/app?lecture=${encodeURIComponent(body.lecture.id)}`);
        return;
      }
      setProgress(null);
      setError(body.error || `Upload failed (HTTP ${xhr.status}).`);
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed. Check your connection and try again.");
    };
    setError(null);
    setProgress(0);
    xhr.send(form);
  };

  const mediaSummary = (() => {
    if (media.status === "empty") return null;
    const f = media.file;
    const kind = media.status === "error" ? null : media.kind === "video" ? "Video" : "Audio";
    return (
      <>
        <span className="truncate text-[15px] font-semibold text-ink" title={f?.name}>
          {f?.name}
        </span>
        {media.status === "error" ? (
          <span data-testid="media-error" className="text-sm text-danger">
            {media.error}
          </span>
        ) : (
          <span data-testid="media-info" className="font-mono text-[13px] tabular-nums text-ink-subtle">
            {kind} · {f ? formatBytes(f.size) : ""} ·{" "}
            {media.status === "reading" ? "reading length…" : formatClock(media.durationMs)}
          </span>
        )}
      </>
    );
  })();

  const captionSummary =
    captions.status === "empty" ? null : (
      <>
        <span className="truncate text-[15px] font-semibold text-ink" title={captions.file.name}>
          {captions.file.name}
        </span>
        {captions.status === "error" ? (
          <span data-testid="captions-error" className="text-sm text-danger">
            {captions.error}
          </span>
        ) : (
          <span data-testid="captions-info" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok-strong">
            <CheckIcon size={15} strokeWidth={2.4} />
            {captions.cues} {captions.cues === 1 ? "caption" : "captions"} · word timings ready
          </span>
        )}
      </>
    );

  return (
    <form
      onSubmit={submit}
      data-testid="upload-form"
      className="panel flex flex-col gap-6 p-5 sm:p-6"
      noValidate
      aria-describedby={available && publicMaxMb === undefined ? undefined : "upload-demo-note"}
    >
      {available && publicMaxMb === undefined ? null : (
        <p id="upload-demo-note" data-testid="upload-demo-note" className="rounded-[14px] bg-desk px-4 py-3 text-sm text-pretty text-ink-muted">
          {available && publicMaxMb !== undefined ? publicUploadNote(publicMaxMb) : UPLOAD_DEMO_MESSAGE}
        </p>
      )}
      <fieldset disabled={!available} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0 disabled:opacity-60">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lecture-title" className="kicker tracking-[0.08em] text-ink-subtle">
          Lecture title
        </label>
        <input
          id="lecture-title"
          data-testid="title-input"
          value={title}
          maxLength={200}
          placeholder="e.g. Calculus I: Related rates"
          onChange={(e) => {
            titleEdited.current = true;
            setTitle(e.target.value);
          }}
          className="min-h-12 rounded-md border-[1.5px] border-line bg-chrome-hover px-3.5 text-base font-semibold text-ink transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-accent-line"
        />
      </div>

      {classes && classes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lecture-class" className="kicker tracking-[0.08em] text-ink-subtle">
            Add to
          </label>
          <select
            id="lecture-class"
            data-testid="upload-class-select"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="min-h-12 w-full rounded-md border-[1.5px] border-line bg-chrome-hover px-3.5 text-base font-semibold text-ink transition-colors hover:border-accent-line"
          >
            <option value="">Just me (personal)</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-pretty text-ink-subtle">
            {classId ? "Everyone in this class can study it, and it shows up in your Class insights." : "Only you will see it."}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="kicker tracking-[0.08em] text-ink-subtle">Recording</span>
        <FileZone
          label="Choose a recording"
          hint={`or drop it here · MP3, M4A, WAV, WebM or MP4 · up to ${publicMaxMb ?? 300} MB`}
          accept={MEDIA_ACCEPT}
          testId="media-input"
          icon={<WaveIcon size={20} />}
          onFile={chooseMedia}
          invalid={media.status === "error"}
        >
          {mediaSummary}
        </FileZone>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="kicker tracking-[0.08em] text-ink-subtle">Captions</span>
          <span className="text-[13px] text-ink-subtle">optional</span>
        </span>
        <FileZone
          label="Choose a captions file"
          hint="or drop it here · WebVTT (.vtt) or SubRip (.srt) · up to 2 MB"
          accept={CAPTIONS_ACCEPT}
          testId="captions-input"
          icon={<CaptionsIcon size={20} />}
          onFile={chooseCaptions}
          invalid={captions.status === "error"}
        >
          {captionSummary}
        </FileZone>
        <p className="text-sm text-pretty text-ink-subtle">
          Captions become the words you follow along with while you write. Without them the lecture still plays, but
          moments won’t show what was said and pauses in your writing aren’t scored.
        </p>
        {!aiConfigured && available && publicMaxMb === undefined ? (
          <p data-testid="upload-ai-note" className="text-xs text-ink-subtle">
            Auto-transcribe needs an OpenAI or Groq key
          </p>
        ) : null}
      </div>
      </fieldset>

      {error ? (
        <p role="alert" data-testid="upload-error" className="rounded-[14px] bg-gap-soft px-4 py-3 text-sm text-gap-strong">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-end">
        {uploading ? (
          <div className="flex min-w-0 flex-1 items-center gap-3" role="status" aria-live="polite">
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-accent-soft">
              <div
                className="absolute inset-0 origin-left rounded-pill bg-accent transition-transform duration-150"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[13px] tabular-nums text-ink-subtle">
              {Math.round((progress ?? 0) * 100)}%
            </span>
          </div>
        ) : null}
        <Link href="/app" className={btnSecondary}>
          Cancel
        </Link>
        <button type="submit" data-testid="upload-submit" disabled={!canSubmit} aria-busy={uploading} className={btnPrimary}>
          {uploading ? "Uploading…" : "Upload lecture"}
        </button>
      </div>
    </form>
  );
}
