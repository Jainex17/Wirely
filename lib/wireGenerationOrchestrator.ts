import type { DesignPlan, PlannedOutput } from "@/lib/wireGenerationTypes";

export interface PlannedOutputTarget {
  outputIndex: number;
  output: PlannedOutput;
  targetPageId: string | null;
}

export const mapPlanOutputsToTargets = ({
  plan,
  targetPageIds,
}: {
  plan: DesignPlan;
  targetPageIds: string[];
}): PlannedOutputTarget[] => {
  return plan.outputs.map((output, outputIndex) => ({
    outputIndex,
    output,
    targetPageId: targetPageIds[outputIndex] ?? null,
  }));
};

export const runWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) => {
  const normalizedConcurrency = Math.max(1, Math.floor(concurrency));
  let cursor = 0;

  const runners = Array.from({
    length: Math.min(normalizedConcurrency, items.length),
  }).map(async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
};
