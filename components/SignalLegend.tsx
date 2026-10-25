// "How TraceIt decides you were stuck": the scoring rules behind the "See the details" chart in
// plain language, with the live numbers from lib/scoring's SCORING_CONFIG. Numbered lime steps, then
// the four signals and their weights.
import { FEATURES } from "@/lib/insights";
import { SCORING_CONFIG } from "@/lib/scoring";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function SignalLegend() {
  const c = SCORING_CONFIG;
  const steps: Array<{ title: string; body: string }> = [
    {
      title: "Learn your normal",
      body: `The first ${c.baselineMs / 60000} minutes of your own writing are your baseline. Nothing there is ever flagged. It is what the rest is compared against, so a slow writer isn't "stuck" just for being slow.`,
    },
    {
      title: "Read four signals every 10 seconds",
      body: "Each signal is scaled from 0 (like your normal) to 1 (far from it), measured against your baseline, not against other students.",
    },
    {
      title: "Blend and smooth",
      body: `The signals are blended by weight into a score, then smoothed with the previous window (${pct(c.emaAlpha)} new, ${pct(1 - c.emaAlpha)} carried over) so one odd stroke can't set it off.`,
    },
    {
      title: "Flag a spike",
      body: `A window is flagged when the smoothed score reaches ${c.spikeScore.toFixed(2)} and at least ${c.minFeaturesOn} signals are on (≥ ${c.featureOn.toFixed(2)}) at once. Flags are at least ${c.refractoryMs / 1000} s apart, and at most ${c.maxSpikes} per session.`,
    },
  ];
  return (
    <section aria-labelledby="how-heading" data-testid="signal-legend" className="flex flex-col gap-4">
      <h2 id="how-heading" className="px-1 text-[26px] leading-tight font-bold text-ink">
        How TraceIt decides you were stuck
      </h2>
      <ol className="grid gap-3.5 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="panel flex gap-3.5 px-5 py-4">
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill bg-highlight font-mono text-sm font-medium text-on-highlight tabular-nums"
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-bold text-ink">{s.title}</span>
              <span className="text-sm leading-relaxed text-pretty text-ink-muted">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <dl className="panel divide-y divide-line overflow-hidden">
        {FEATURES.map((f) => (
          <div key={f.key} className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="flex items-baseline justify-between gap-2 text-[15px] font-bold text-ink sm:justify-start">
              {f.label}
              <span className="rounded-pill bg-accent-soft px-2 py-px font-mono text-xs font-medium text-accent-strong tabular-nums">
                {pct(f.weight)}
              </span>
            </dt>
            <dd className="text-sm leading-relaxed text-pretty text-ink-muted">{f.explain}</dd>
          </div>
        ))}
      </dl>
      <p className="px-1 text-xs text-pretty text-ink-subtle">
        Without a transcript the pause signal is off and its weight is shared by the others; without pen pressure the
        pressure weight is shared the same way.
      </p>
    </section>
  );
}
