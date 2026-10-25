import { loadEvaluation } from "@/app/(product)/insights/evaluation/load";
import { withUser } from "@/lib/auth/core";

/** Precision / recall of TraceIt's detectors on the small labeled demo set (see lib/evaluation). */
export const GET = withUser(async () => {
  const { groundTruth, report } = await loadEvaluation();
  return Response.json({
    groundTruth: { name: groundTruth.name, note: groundTruth.note, toleranceMs: groundTruth.toleranceMs },
    report,
  });
});
