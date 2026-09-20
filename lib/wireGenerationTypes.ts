import { z } from "zod";
import { WIRE_STYLE_PRESETS } from "@/lib/wirePrompt";
import { artifactCategories } from "@/lib/wireIntent";

const PRESET_IDS = WIRE_STYLE_PRESETS.map((preset) => preset.id) as [
  string,
  ...string[],
];

export const generationModeSchema = z.enum([
  "single_page",
  "concept_variants",
  "information_architecture",
]);

export const generationOutputKindSchema = z.enum(["page", "concept"]);

const globalDesignSchema = z.object({
  presetId: z.enum(PRESET_IDS),
  paletteIntent: z.string().trim().min(8).max(240),
  typographyDirection: z.string().trim().min(8).max(240),
  density: z.enum(["airy", "balanced", "dense"]),
  motion: z.enum(["minimal", "refined", "bold"]),
  differentiationHook: z.string().trim().min(8).max(240),
  stockImages: z.object({
    enabled: z.boolean(),
    visualIntent: z.string().trim().min(4).max(200),
    keywords: z.array(z.string().trim().min(2).max(40)).min(1).max(8),
  }),
});

const stockImageSlotSchema = z.object({
  id: z.string().trim().min(1).max(64),
  sectionId: z.string().trim().min(1).max(64),
  query: z.string().trim().min(3).max(200),
  aspectRatio: z.enum(["21:9", "16:9", "4:3", "1:1", "3:4"]),
  priority: z.enum(["hero", "supporting"]),
  altHint: z.string().trim().min(3).max(160),
});

const sectionBlueprintSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  purpose: z.string().trim().min(8).max(240),
  emphasis: z.enum(["primary", "secondary", "supporting"]),
  layoutHint: z.string().trim().min(8).max(240),
});

export const plannedOutputSchema = z.object({
  key: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  outputKind: generationOutputKindSchema,
  conceptName: z.string().trim().min(1).max(120).optional(),
  pageRole: z.string().trim().min(2).max(120),
  layoutStrategy: z.string().trim().min(8).max(240),
  sectionBlueprint: z.array(sectionBlueprintSchema).min(3).max(12),
  requiredElements: z.array(z.string().trim().min(2).max(120)).min(3).max(16),
  imageSlots: z.array(stockImageSlotSchema).max(6),
});

export const designPlanSchema = z.object({
  generationMode: generationModeSchema,
  artifactType: z.string().trim().min(2).max(120),
  // Optional so a weaker planner that omits it still produces a valid plan; the
  // keyword fallback in wireIntent covers that case.
  artifactCategory: z.enum(artifactCategories).optional(),
  audience: z.string().trim().min(2).max(240),
  brandSummary: z.string().trim().min(8).max(280),
  tone: z.string().trim().min(2).max(120),
  globalDesign: globalDesignSchema,
  outputs: z.array(plannedOutputSchema).min(1).max(3),
});

export type GenerationMode = z.infer<typeof generationModeSchema>;
export type GenerationOutputKind = z.infer<typeof generationOutputKindSchema>;
export type PlannedOutput = z.infer<typeof plannedOutputSchema>;
export type DesignPlan = z.infer<typeof designPlanSchema>;

const DESIGN_PLAN_TOP_LEVEL_KEYS = [
  "generationMode",
  "artifactType",
  "audience",
  "brandSummary",
  "tone",
  "globalDesign",
  "outputs",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const looksLikeDesignPlanRecord = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  DESIGN_PLAN_TOP_LEVEL_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const unwrapDesignPlanCandidate = (value: unknown): unknown => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return unwrapDesignPlanCandidate(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }

  if (looksLikeDesignPlanRecord(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) {
      return unwrapDesignPlanCandidate(value[0]);
    }
    return value;
  }

  if (!isRecord(value)) {
    return value;
  }

  const nestedCandidates = [
    value.designPlan,
    value.plan,
    value.response,
    value.result,
    value.output,
    value.object,
    value.data,
  ];

  for (const candidate of nestedCandidates) {
    if (candidate === undefined) continue;
    const unwrapped = unwrapDesignPlanCandidate(candidate);
    if (looksLikeDesignPlanRecord(unwrapped)) {
      return unwrapped;
    }
  }

  return value;
};

const normalizeOutput = (
  output: PlannedOutput,
  index: number,
  generationMode: GenerationMode,
): PlannedOutput => {
  const normalizedTitle =
    output.title.trim() ||
    output.conceptName?.trim() ||
    (generationMode === "concept_variants"
      ? `Concept ${index + 1}`
      : `Page ${index + 1}`);

  const normalizedKey =
    output.key.trim() ||
    normalizedTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    `output-${index + 1}`;

  const outputKind =
    generationMode === "concept_variants" ? "concept" : "page";

  return {
    ...output,
    key: normalizedKey,
    title: normalizedTitle,
    outputKind,
    conceptName:
      generationMode === "concept_variants"
        ? output.conceptName?.trim() || normalizedTitle
        : undefined,
    imageSlots: output.imageSlots.map((slot) => ({
      ...slot,
      id: slot.id.trim().toLowerCase(),
      sectionId: slot.sectionId.trim().toLowerCase(),
    })),
  };
};

export const validateDesignPlan = ({
  value,
  expectedOutputCount,
  requestedMode,
  allowPlannerOutputCount = false,
}: {
  value: unknown;
  expectedOutputCount: number;
  requestedMode?: GenerationMode;
  /** When the planner owns the decision, any count the schema allows is valid. */
  allowPlannerOutputCount?: boolean;
}) => {
  const parsed = designPlanSchema.parse(unwrapDesignPlanCandidate(value));

  if (!allowPlannerOutputCount && parsed.outputs.length !== expectedOutputCount) {
    throw new Error(
      `Planner output count mismatch. Expected ${expectedOutputCount}, received ${parsed.outputs.length}.`,
    );
  }

  if (requestedMode === "single_page" && parsed.generationMode !== "single_page") {
    throw new Error("Planner must emit single_page mode for single-output requests.");
  }

  const outputs = parsed.outputs.map((output, index) =>
    normalizeOutput(output, index, parsed.generationMode),
  );

  if (parsed.generationMode === "concept_variants") {
    const distinctTitles = new Set(outputs.map((output) => output.title.toLowerCase()));
    if (distinctTitles.size !== outputs.length) {
      throw new Error("Concept variant titles must be unique.");
    }
  }

  if (parsed.generationMode === "information_architecture") {
    const distinctRoles = new Set(outputs.map((output) => output.pageRole.toLowerCase()));
    if (distinctRoles.size !== outputs.length) {
      throw new Error("Information architecture outputs must have unique page roles.");
    }
  }

  if (parsed.globalDesign.stockImages.enabled) {
    const hasAnyImageSlots = outputs.some((output) => output.imageSlots.length > 0);
    if (!hasAnyImageSlots) {
      throw new Error(
        "Planner enabled stock images but did not provide any output image slots.",
      );
    }
  }

  return {
    ...parsed,
    outputs,
  };
};
