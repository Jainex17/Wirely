import { z } from "zod";

export const critiqueReportSchema = z.object({
  summary: z.string().trim().min(8).max(400),
  fidelityScore: z.number().min(0).max(100),
  depthScore: z.number().min(0).max(100),
  distinctnessScore: z.number().min(0).max(100),
  keepabilityScore: z.number().min(0).max(100),
  missingRequiredElements: z.array(z.string().trim().min(1).max(120)).max(16),
  majorIssues: z.array(z.string().trim().min(1).max(240)).max(12),
  recommendedFixes: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
  shouldRepair: z.boolean(),
});

export type CritiqueReport = z.infer<typeof critiqueReportSchema>;

const CRITICAL_QUALITY_VIOLATIONS = new Set([
  "document_structure_incomplete",
  "style_tag_present",
  "inline_style_present",
  "disallowed_script_detected",
  "image_present_without_permission",
  "chart_placeholder_detected",
  "missing_chart_render_signal",
  "intent_mismatch_dashboard_in_landing",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const readString = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const readBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
};

const normalizeScore = (value: unknown, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  if (value >= 0 && value <= 1) {
    return Math.round(value * 100);
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const humanizeViolation = (violation: string) =>
  violation
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

export const normalizeCritiqueReport = (value: unknown): CritiqueReport | null => {
  const direct = critiqueReportSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  if (!isRecord(value)) {
    return null;
  }

  const summary =
    readString(value.summary) ||
    readString(value.evaluation) ||
    readString(value.assessment) ||
    "Generated output needs refinement for production quality.";

  const majorIssuesSource = normalizeStringArray(
    value.majorIssues ??
      value.major_issues ??
      value.violations ??
      value.qualityViolations,
  );
  const missingRequiredElementsSource = normalizeStringArray(
    value.missingRequiredElements ?? value.missing_required_elements,
  );
  const missingRequiredElements =
    missingRequiredElementsSource.length > 0
      ? missingRequiredElementsSource
      : majorIssuesSource.filter((issue) => /^missing[_\s-]/i.test(issue));
  const majorIssues =
    majorIssuesSource.length > 0
      ? majorIssuesSource
      : missingRequiredElements.map((issue) => humanizeViolation(issue));

  const recommendedFixesSource = normalizeStringArray(
    value.recommendedFixes ?? value.recommended_fixes ?? value.fixes,
  );
  const recommendedFixes =
    recommendedFixesSource.length > 0
      ? recommendedFixesSource
      : majorIssues
          .slice(0, 5)
          .map((issue) => `Resolve: ${humanizeViolation(issue)}.`);

  const averageScore = normalizeScore(
    value.keepabilityScore ??
      value.keepability_score ??
      value.keepableScore ??
      value.keepable_score ??
      value.fidelityScore ??
      value.fidelity_score ??
      value.depthScore ??
      value.depth_score ??
      value.contentScore ??
      value.content_score ??
      value.distinctnessScore ??
      value.distinctness_score ??
      value.artDirectionScore ??
      value.art_direction_score,
    70,
  );

  const normalized: CritiqueReport = {
    summary,
    fidelityScore: normalizeScore(
      value.fidelityScore ?? value.fidelity_score,
      averageScore,
    ),
    depthScore: normalizeScore(
      value.depthScore ?? value.depth_score ?? value.contentScore ?? value.content_score,
      averageScore,
    ),
    distinctnessScore: normalizeScore(
      value.distinctnessScore ??
        value.distinctness_score ??
        value.artDirectionScore ??
        value.art_direction_score,
      averageScore,
    ),
    keepabilityScore: normalizeScore(
      value.keepabilityScore ??
        value.keepability_score ??
        value.keepableScore ??
        value.keepable_score,
      averageScore,
    ),
    missingRequiredElements: missingRequiredElements.slice(0, 16),
    majorIssues: majorIssues.slice(0, 12),
    recommendedFixes:
      recommendedFixes.length > 0
        ? recommendedFixes.slice(0, 12)
        : ["Improve information hierarchy and strengthen section specificity."],
    shouldRepair:
      readBoolean(
        value.shouldRepair ??
          value.should_repair ??
          value.repairNeeded ??
          value.repair_needed,
      ) ??
      averageScore < 80,
  };

  const parsed = critiqueReportSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
};

export const buildFallbackCritiqueReport = ({
  qualityScore,
  qualityViolations,
}: {
  qualityScore: number;
  qualityViolations: string[];
}): CritiqueReport => {
  const boundedQualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));
  const majorIssues = qualityViolations
    .slice(0, 12)
    .map((violation) => humanizeViolation(violation));
  const missingRequiredElements = qualityViolations
    .filter((violation) => /^missing[_-]/i.test(violation))
    .slice(0, 16)
    .map((violation) => humanizeViolation(violation));

  const shouldRepair =
    boundedQualityScore < 80 ||
    hasCriticalQualityViolations(qualityViolations) ||
    missingRequiredElements.length > 0;

  return {
    summary:
      majorIssues.length > 0
        ? `Auto-critique fallback detected issues: ${majorIssues.slice(0, 3).join(", ")}.`
        : "Auto-critique fallback accepted the draft as structurally sound.",
    fidelityScore: boundedQualityScore,
    depthScore: Math.max(0, boundedQualityScore - 4),
    distinctnessScore: Math.max(0, boundedQualityScore - 2),
    keepabilityScore: Math.max(0, boundedQualityScore - (shouldRepair ? 6 : 0)),
    missingRequiredElements,
    majorIssues,
    recommendedFixes:
      majorIssues.length > 0
        ? majorIssues.slice(0, 6).map((issue) => `Address: ${issue}.`)
        : ["Maintain current structure and improve polish in micro-interactions."],
    shouldRepair,
  };
};

export const hasCriticalQualityViolations = (violations: string[]) =>
  violations.some((violation) => CRITICAL_QUALITY_VIOLATIONS.has(violation));

export const shouldRepairGeneratedOutput = ({
  qualityScore,
  isRenderable,
  qualityViolations,
  critique,
}: {
  qualityScore: number;
  isRenderable: boolean;
  qualityViolations: string[];
  critique: CritiqueReport;
}) => {
  if (!isRenderable) return true;
  if (qualityScore < 80) return true;
  if (hasCriticalQualityViolations(qualityViolations)) return true;
  if (critique.shouldRepair) return true;
  if (critique.missingRequiredElements.length > 0) return true;
  return false;
};

export const isAcceptedGeneratedOutput = ({
  qualityScore,
  isRenderable,
  qualityViolations,
}: {
  qualityScore: number;
  isRenderable: boolean;
  qualityViolations: string[];
}) => {
  if (!isRenderable) return false;
  if (hasCriticalQualityViolations(qualityViolations)) return false;
  return qualityScore >= 72;
};
