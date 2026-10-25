import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth/server";
import DeskShell from "@/components/DeskShell";
import EvaluationSweep from "@/components/EvaluationSweep";
import { ConfusionTable, DetectorCards, LabelTable } from "@/components/EvaluationSummary";
import { ChevronRightIcon } from "@/components/icons";
import { Mark, PageHeader, btnLink } from "@/components/ui";
import { loadEvaluation } from "./load";

export const metadata: Metadata = {
  title: "Accuracy check · TraceIt",
  description: "How often TraceIt's hesitation detector agrees with hand labels (precision and recall), with a threshold sensitivity sweep.",
  // Not part of the student app (only the landing page links here): kept out of search.
  robots: { index: false, follow: false },
};

/** Section heading on this page (Bricolage, as "Teaching this class?" on the desk). */
const sectionTitle = "px-1 text-[26px] leading-tight font-bold text-ink";

export default async function EvaluationPage() {
  await connection();
  await requireUser("/insights/evaluation");
  const { groundTruth, report } = await loadEvaluation();
  const stored = report.cases.every((c) => c.source === "stored");
  const firstLabeled = report.cases.find((c) => c.labels.length > 0);

  return (
    <DeskShell active="growth">
      <main
        data-testid="evaluation"
        data-label-count={report.labelCount}
        data-source={stored ? "stored" : "scenario"}
        className="flex-1 px-[clamp(16px,4vw,64px)] pt-8 pb-14 lg:pt-12"
      >
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-10">
          <PageHeader
            as="h1"
            eyebrow="Accuracy check"
            title={
              <>
                Does it flag the right <Mark>moments?</Mark>
              </>
            }
          >
            <p className="max-w-2xl text-[16.5px] leading-relaxed text-pretty text-ink-muted">
              TraceIt&apos;s flags, scored against hand labels of where the student was actually confused. A flag counts
              when it lands within ±{groundTruth.toleranceMs / 1000} s of a label; each label matches at most one flag
              (nearest first).
            </p>
            <p
              data-testid="evaluation-caveat"
              className="max-w-2xl rounded-[16px] border border-gap/30 bg-gap-soft px-4 py-3 text-sm text-pretty text-gap-strong"
            >
              <strong className="font-bold">Small labeled demo set</strong> — {report.sessionCount} sessions,{" "}
              {report.labelCount} labels. A sanity check that the pipeline does what it claims, not a benchmark.
            </p>
          </PageHeader>

          <section aria-labelledby="detectors-heading" className="flex flex-col gap-3.5">
            <h2 id="detectors-heading" className={sectionTitle}>
              At the threshold we ship ({report.spikeScore.toFixed(2)})
            </h2>
            <DetectorCards report={report} />
            <ConfusionTable report={report} />
          </section>

          <section aria-labelledby="labels-heading" className="flex flex-col gap-3.5">
            <h2 id="labels-heading" className={sectionTitle}>
              Label by label
            </h2>
            <LabelTable report={report} />
            <p className="px-1 text-sm leading-relaxed text-pretty text-ink-muted">
              Spikes can&apos;t fire while TraceIt is still learning a student&apos;s normal (the first two minutes of
              their writing), so confusion that early is caught only by pairing an erase with its rewrite. That is why the
              full pipeline is the number students actually experience.
            </p>
          </section>

          <section aria-labelledby="sweep-heading" className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5 px-1">
              <h2 id="sweep-heading" className="text-[26px] leading-tight font-bold text-ink">
                What if the threshold moved?
              </h2>
              <p className="text-sm leading-relaxed text-pretty text-ink-muted">
                Every point re-runs the scoring model on the same ink and transcript with a different spikeScore. A spike
                also needs two signals on at once, so lowering the threshold alone adds few flags.
              </p>
            </div>
            <EvaluationSweep sweep={report.sweep} shipped={report.spikeScore} />
          </section>

          <section aria-labelledby="data-heading" className="flex flex-col gap-2.5">
            <h2 id="data-heading" className={sectionTitle}>
              About the labels
            </h2>
            <p data-testid="evaluation-note" className="px-1 text-sm leading-relaxed text-pretty text-ink-muted">
              {groundTruth.note}
            </p>
            <p className="px-1 text-xs text-pretty text-ink-subtle">
              Ink:{" "}
              {stored
                ? "the seeded sessions as stored in the database."
                : "rebuilt from lib/demoScenario — the same ink `npm run seed:demo` stores (the demo isn't seeded here)."}{" "}
              Labels: public/demo/ground-truth.json · also served as JSON at{" "}
              <a href="/api/evaluation" className="font-mono font-medium text-accent underline-offset-2 hover:underline">
                /api/evaluation
              </a>
              .
            </p>
            {firstLabeled && firstLabeled.source === "stored" ? (
              <Link
                href={`/insights/${encodeURIComponent(firstLabeled.sessionId)}`}
                data-testid="evaluation-signal-link"
                className={`${btnLink} self-start`}
              >
                See the details for {firstLabeled.title}
                <ChevronRightIcon size={16} />
              </Link>
            ) : null}
          </section>
        </div>
      </main>
    </DeskShell>
  );
}
