import type { DesignPlan } from "@/lib/wireGenerationTypes";

const MAX_BRIEF_LENGTH = 1600;

const formatOutput = (plan: DesignPlan, output: DesignPlan["outputs"][number], index: number) =>
  [
    `${index + 1}. ${output.title}`,
    `Role: ${output.pageRole}`,
    `Strategy: ${output.layoutStrategy}`,
    `Sections: ${output.sectionBlueprint.map((section) => section.label).join(", ")}`,
    `Required: ${output.requiredElements.join(", ")}`,
    output.imageSlots.length > 0
      ? `Images: ${output.imageSlots.map((slot) => slot.query).join(" | ")}`
      : "Images: none",
  ].join("\n");

export const buildWirePlanningSummary = ({
  plan,
  designBrief,
}: {
  plan: DesignPlan;
  designBrief: string;
}) => {
  const brief = designBrief.trim().replace(/\s+\n/g, "\n").slice(0, MAX_BRIEF_LENGTH);

  return [
    `Mode: ${plan.generationMode}`,
    `Artifact: ${plan.artifactType}`,
    `Audience: ${plan.audience}`,
    `Brand: ${plan.brandSummary}`,
    `Tone: ${plan.tone}`,
    `Palette: ${plan.globalDesign.paletteIntent}`,
    `Typography: ${plan.globalDesign.typographyDirection}`,
    `Density: ${plan.globalDesign.density}`,
    `Motion: ${plan.globalDesign.motion}`,
    `Hook: ${plan.globalDesign.differentiationHook}`,
    `Stock images: ${
      plan.globalDesign.stockImages.enabled
        ? `${plan.globalDesign.stockImages.visualIntent} (${plan.globalDesign.stockImages.keywords.join(", ")})`
        : "disabled"
    }`,
    "",
    "Outputs:",
    ...plan.outputs.map((output, index) => formatOutput(plan, output, index)),
    "",
    "Design brief:",
    brief || "No additional design brief provided.",
  ]
    .join("\n")
    .trim();
};
