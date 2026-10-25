// Presentation helpers for learning-timeline moments. Pure; safe on client and server.
import { SCORING_CONFIG } from "./scoring";
import type { ConfusionWindow, Revision, Stroke, TimelineEvent, TimelineEventType } from "./types";

export const MOMENT_META: Record<
  TimelineEventType,
  { label: string; legend: string; plural: [one: string, many: string]; color: string }
> = {
  // `color` mirrors the --color-* tokens in app/(product)/globals.css (canvas drawing needs literal colours).
  misconception_corrected: { label: "Fixed", legend: "Fixed", plural: ["fixed", "fixed"], color: "#0e9f6e" },
  unresolved_gap: { label: "Still fuzzy", legend: "Still fuzzy", plural: ["still fuzzy", "still fuzzy"], color: "#f08c00" },
  breakthrough: { label: "Aha moment", legend: "Aha moment", plural: ["aha moment", "aha moments"], color: "#e0338a" },
};

export const MOMENT_ORDER: TimelineEventType[] = ["misconception_corrected", "unresolved_gap", "breakthrough"];

/** Study mode's reading order group: open "still fuzzy" first, then fixed, then aha moments, then cleared gaps. */
function importance(e: Pick<TimelineEvent, "type" | "status">): number {
  if (e.type === "unresolved_gap") return e.status === "open" ? 0 : 3;
  return e.type === "misconception_corrected" ? 1 : 2;
}

/**
 * The guided review's order ("by importance"): open gaps, then corrections, then breakthroughs, then
 * gaps already cleared; by lecture time within each group. Returns a new array.
 */
export function momentsByImportance<T extends Pick<TimelineEvent, "id" | "type" | "status" | "lectureMs">>(events: T[]): T[] {
  return [...events].sort(
    (a, b) => importance(a) - importance(b) || a.lectureMs - b.lectureMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The scoring window an event belongs to (the one it was linked to, else the one containing it). */
export function windowFor(event: TimelineEvent, windows: ConfusionWindow[]): ConfusionWindow | undefined {
  const start =
    event.windowStartMs ?? Math.floor(event.lectureMs / SCORING_CONFIG.windowMs) * SCORING_CONFIG.windowMs;
  return windows.find((w) => w.bucketStartMs === start);
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Human-readable "why was this flagged" lines for a moment. Never empty. */
export function reasonsFor(
  event: TimelineEvent,
  windows: ConfusionWindow[],
  revision: Revision | undefined,
  strokesById: Map<string, Stroke>,
): string[] {
  const out = [...(windowFor(event, windows)?.reasons ?? [])];
  if (revision) {
    const after = revision.afterStrokeIds.map((id) => strokesById.get(id)).filter((s): s is Stroke => !!s);
    if (after.length > 0) {
      const firstAfter = Math.min(...after.map((s) => s.startMs));
      const secs = Math.max(0, Math.round((firstAfter - revision.lectureMs) / 1000));
      out.push(secs <= 1 ? "erased this and rewrote it right away" : `erased this and rewrote it ${secs}s later`);
    }
  }
  if (out.length === 0) {
    out.push(event.type === "unresolved_gap" ? "your writing rhythm changed sharply here" : "you revised your notes here");
  }
  return out.map(capitalize);
}
