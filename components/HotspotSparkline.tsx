// "Where you slowed down" (My progress): a bar chart of the signed-in student's own erasing per 30 s
// of a lecture, over all their sessions on it (lib/hotspots). Server
// component: plain bars (indigo, deeper where more was erased, the peak marked in handwriting) with
// a native tooltip per column and a screen-reader table.
import { slowestStretches, type HotspotBar } from "@/lib/hotspots";
import { formatClock } from "@/lib/time";

const range = (b: HotspotBar) => `${formatClock(b.startMs)}–${formatClock(b.endMs)}`;

/** Bar height as % of the plot: a sliver for quiet stretches, up to 92% (room for the "peak!" note). */
const barHeight = (b: HotspotBar) => (b.erased > 0 ? Math.max(6, b.level * 92) : 3);

/** Literal classes per intensity (Tailwind needs whole class names). */
function barTone(b: HotspotBar, peak: HotspotBar | undefined): string {
  if (b.erased === 0) return "bg-accent-line/50";
  if (b === peak) return "bg-accent";
  if (b.level >= 0.6) return "bg-ghost";
  if (b.level >= 0.3) return "bg-ghost/75";
  return "bg-accent-line";
}

function columnGap(columns: number): string {
  if (columns > 40) return "gap-px";
  if (columns > 20) return "gap-1";
  return "gap-1.5 sm:gap-2";
}

export default function HotspotSparkline({
  bars,
  durationMs,
  source,
  lectureTitle,
}: {
  bars: HotspotBar[];
  durationMs: number;
  /** Where the numbers come from (hotspotSourceLabel). */
  source: string;
  lectureTitle: string;
}) {
  const total = bars.reduce((n, b) => n + b.erased, 0);
  const [peak, second] = slowestStretches(bars, 2);
  const summary = peak
    ? `Your erasing per 30 seconds of ${lectureTitle}: most at ${range(peak)} (${peak.erased} erased)${
        second ? `, then ${range(second)} (${second.erased})` : ""
      }.`
    : `No erasing recorded yet for ${lectureTitle}.`;
  // Long lectures have many 30 s columns: tighter gaps and corners so the bars stay visible.
  const dense = bars.length > 40;

  return (
    <figure
      data-testid="hotspots"
      data-peak-ms={peak?.startMs ?? ""}
      data-source={source}
      className="panel flex flex-col gap-3.5 px-5 pt-5 pb-4 shadow-none sm:px-[22px]"
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <span className="text-base font-bold text-ink">Where you slowed down</span>
        <span className="text-[13px] text-ink-subtle">
          Your erasing per 30-second slice, all your sessions combined
          {peak ? (
            <>
              {" "}
              · peak at <span className="font-mono tabular-nums text-ink">{formatClock(peak.startMs)}</span>
            </>
          ) : null}
        </span>
      </figcaption>

      <div
        role="img"
        aria-label={summary}
        className={`mt-4 flex h-[130px] items-end border-b-[1.5px] border-line ${columnGap(bars.length)}`}
      >
        {bars.map((b) => {
          const h = barHeight(b);
          return (
            // The whole column is the hover target for its tooltip, not just the bar.
            <span
              key={b.startMs}
              title={`${range(b)} · ${b.erased} erased of ${b.strokes} strokes`}
              className="relative flex h-full min-w-0 flex-1 items-end"
            >
              <span
                className={`w-full ${dense ? "rounded-t-[2px]" : "rounded-t-[6px]"} ${barTone(b, peak)}`}
                style={{ height: `${h}%` }}
              />
              {b === peak ? (
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2 font-hand text-[22px] leading-none whitespace-nowrap text-accent-strong"
                  style={{ bottom: `calc(${h}% + 4px)` }}
                >
                  peak!
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

      <div aria-hidden="true" className="flex justify-between font-mono text-xs tabular-nums text-ink-subtle">
        <span>00:00</span>
        <span>{formatClock(durationMs / 2)}</span>
        <span>{formatClock(durationMs)}</span>
      </div>
      <span className="text-xs text-pretty text-ink-subtle">
        Built from {total} erased {total === 1 ? "stroke" : "strokes"} · {source}
      </span>

      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Lecture time</th>
              <th scope="col">Erased</th>
              <th scope="col">Strokes</th>
            </tr>
          </thead>
          <tbody>
            {bars
              .filter((b) => b.strokes > 0)
              .map((b) => (
                <tr key={b.startMs}>
                  <td>{range(b)}</td>
                  <td>{b.erased}</td>
                  <td>{b.strokes}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
