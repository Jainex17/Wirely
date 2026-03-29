import {
  buildImageRule,
  buildIntentGuardrails,
  getWireStylePresetById,
  selectWireStylePreset,
  type WireStylePreset,
} from "@/lib/wirePrompt";
import type {
  DesignPlan,
  GenerationMode,
  PlannedOutput,
} from "@/lib/wireGenerationTypes";

const TAILWIND_CDN = `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`;
const ELEMENTS_CDN = `<script src="https://cdn.jsdelivr.net/npm/@tailwindplus/elements@1" type="module"></script>`;
const CHARTJS_CDN = `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>`;
const BOOTSTRAP_ICONS_CDN = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">`;

const formatHistory = (
  history: Array<{ role: "user" | "assistant"; content: string }>,
) => {
  if (history.length === 0) return "No prior conversation context.";
  return history
    .map(
      (message, index) =>
        `${index + 1}. ${message.role.toUpperCase()}: ${message.content.trim()}`,
    )
    .join("\n");
};

const formatTargetPages = (
  pages: Array<{ id: string; title: string; html?: string }>,
) => {
  if (pages.length === 0) return "No explicit target pages supplied.";
  return pages
    .map((page, index) =>
      [
        `Page ${index + 1}:`,
        `- id: ${page.id}`,
        `- title: ${page.title}`,
        page.html?.trim()
          ? `- currentHtmlPresent: yes`
          : "- currentHtmlPresent: no",
      ].join("\n"),
    )
    .join("\n");
};

export const composePlannerPrompt = ({
  userPrompt,
  compactHistory,
  requestedOutputCount,
  targetPages,
  forceSinglePage,
  suggestedPreset,
}: {
  userPrompt: string;
  compactHistory: Array<{ role: "user" | "assistant"; content: string }>;
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  forceSinglePage: boolean;
  suggestedPreset: WireStylePreset;
}) => {
  const modeInstruction = forceSinglePage
    ? '- You must emit "single_page" mode and exactly 1 output.'
    : requestedOutputCount > 1
      ? [
          `- You must emit exactly ${requestedOutputCount} outputs.`,
          '- Choose "concept_variants" when the prompt primarily asks for options or alternative directions.',
          '- Choose "information_architecture" when the prompt clearly implies distinct site pages, named pages, or a site map.',
          '- Do not choose "single_page" when more than 1 output is required.',
        ].join("\n")
      : [
          '- Emit exactly 1 output.',
          '- Use "single_page" unless the prompt truly requires site architecture semantics.',
        ].join("\n");

  return `
You are Wirely's planning engine. Convert the user's request into a deterministic design plan for downstream HTML generation.

Rules:
- Return a design plan only through the structured output schema.
- Decide structure first, not code.
- The plan must be rich enough that another model can generate distinctive HTML without inventing core architecture.
- Do not return wrapper keys like "designPlan", "pages", or "outputKind" at the top level.
- The top-level object must contain exactly these conceptual fields: generationMode, artifactType, audience, brandSummary, tone, globalDesign, outputs.
- Keep titles concrete and marketable. Avoid generic titles like "Page 1" or "Variant 2".
- Use preset id "${suggestedPreset.id}" unless the prompt strongly implies a different preset from the allowed set.
- Prefer memorable concept names for concept variants.
- For information architecture, outputs must represent different real pages.
${modeInstruction}

Context:
- User prompt: ${userPrompt}
- Suggested preset: ${suggestedPreset.id} (${suggestedPreset.name})
- Conversation summary:
${formatHistory(compactHistory)}

- Target pages:
${formatTargetPages(targetPages)}

Required planning standards:
- artifactType must match the requested thing exactly.
- audience must be specific.
- brandSummary should compress the product/value proposition.
- globalDesign must commit to palette, typography, density, motion, and one memorable hook.
- Every output needs a distinct layout strategy.
- Every output needs at least 3 required elements and at least 3 planned sections.
- outputKind must align with the chosen generationMode.
`.trim();
};

const formatPlanOutput = (output: PlannedOutput) =>
  [
    `Title: ${output.title}`,
    `Kind: ${output.outputKind}`,
    `Concept name: ${output.conceptName ?? "n/a"}`,
    `Page role: ${output.pageRole}`,
    `Layout strategy: ${output.layoutStrategy}`,
    "Section blueprint:",
    ...output.sectionBlueprint.map(
      (section, index) =>
        `${index + 1}. ${section.label} | ${section.emphasis} | ${section.purpose} | ${section.layoutHint}`,
    ),
    `Required elements: ${output.requiredElements.join(", ")}`,
  ].join("\n");

const conceptVariantAxes = [
  {
    name: "Warm Narrative",
    paletteCue: "Use warm neutral surfaces with one earthy saturated accent.",
    typographyCue: "Lean toward humanist, approachable heading/body contrast.",
    compositionCue:
      "Favor centered storytelling bands and a clear conversion funnel rhythm.",
  },
  {
    name: "Editorial Contrast",
    paletteCue: "Use cooler neutrals with higher contrast accents and stronger tonal jumps.",
    typographyCue: "Use expressive display type with refined editorial body balance.",
    compositionCue:
      "Use asymmetric split layouts with offset blocks and narrative side modules.",
  },
  {
    name: "Modular Intensity",
    paletteCue:
      "Use bold high-contrast zones with tighter color blocking and assertive accents.",
    typographyCue:
      "Use compact heading styles and tighter scale steps for denser information rhythm.",
    compositionCue:
      "Favor stacked modules, segmented surfaces, and visibly separated content blocks.",
  },
];

const composeConceptVariantDifferentiationRules = ({
  plan,
  outputIndex,
  allOutputs,
}: {
  plan: DesignPlan;
  outputIndex: number;
  allOutputs: PlannedOutput[];
}) => {
  if (plan.generationMode !== "concept_variants" || allOutputs.length <= 1) {
    return "";
  }

  const variantAxis = conceptVariantAxes[outputIndex % conceptVariantAxes.length];
  const siblingSummary = allOutputs
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ index }) => index !== outputIndex)
    .map(
      ({ candidate }) =>
        `- ${candidate.title}: ${candidate.layoutStrategy} Required elements: ${candidate.requiredElements.join(", ")}.`,
    )
    .join("\n");

  return `
Variant uniqueness constraints (critical):
- This output is concept variant ${outputIndex + 1} of ${allOutputs.length}.
- Keep brand/product messaging aligned, but make first-screen visual identity unmistakably different from siblings.
- Variant axis: ${variantAxis.name}.
- Palette cue: ${variantAxis.paletteCue}
- Typography cue: ${variantAxis.typographyCue}
- Composition cue: ${variantAxis.compositionCue}
- Do not mirror sibling hero composition, section ordering, or accent-color emphasis.
- Sibling directions to avoid overlapping with:
${siblingSummary}
`.trim();
};

export const resolveStylePresetForPlan = (plan: DesignPlan, userPrompt: string) =>
  getWireStylePresetById(plan.globalDesign.presetId) ??
  selectWireStylePreset({
    userPrompt,
  });

export const composePlannedGenerateSystemPrompt = ({
  plan,
  output,
  outputIndex,
  allOutputs,
  stylePreset,
  allowImages,
  userPrompt,
}: {
  plan: DesignPlan;
  output: PlannedOutput;
  outputIndex: number;
  allOutputs: PlannedOutput[];
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
}) =>
  `
You are an expert product designer and frontend engineer.
Generate one production-quality HTML interface from the supplied design plan.
Do not invent a new direction. Execute the plan with conviction and polish.

Return plain text only with these sections in order:

DETAILS:
Write exactly 2 sentences maximum.
- Sentence 1: name + aesthetic direction.
- Sentence 2: key structural or experiential strengths.

HTML:
- A full HTML document starting with <!doctype html>.
- Use semantic HTML5 and Tailwind utility classes only.
- Include ${TAILWIND_CDN} in <head>.
- Include ${ELEMENTS_CDN} in <head>.
- Include ${BOOTSTRAP_ICONS_CDN} in <head>.
- Include ${CHARTJS_CDN} only when the artifact genuinely needs charts.
- Include viewport meta and explicit background/text classes on <body>.
- Do not use <style> tags or inline style attributes.
- No markdown or code fences.

Plan-wide context:
- Artifact type: ${plan.artifactType}
- Audience: ${plan.audience}
- Brand summary: ${plan.brandSummary}
- Tone: ${plan.tone}
- Generation mode: ${plan.generationMode}
- Preset: ${stylePreset.name} (${stylePreset.id})
- Palette intent: ${plan.globalDesign.paletteIntent}
- Typography direction: ${plan.globalDesign.typographyDirection}
- Density: ${plan.globalDesign.density}
- Motion: ${plan.globalDesign.motion}
- Differentiation hook: ${plan.globalDesign.differentiationHook}

This output:
${formatPlanOutput(output)}

Execution rules:
- Follow the plan literally for section count, layout strategy, and required elements.
- Make this feel like a strong first draft someone would keep iterating on.
- Avoid generic SaaS boilerplate and repetitive equal-weight card grids.
- Use strong hierarchy, real content rhythm, and intentional visual contrast.
- If outputKind is "concept", make the concept identity obvious in the typography, composition, and palette.
- If outputKind is "page", make the page role obvious in the information hierarchy.
- Keep copy concise but specific.
- Use meaningful hover/focus states.
${composeConceptVariantDifferentiationRules({
  plan,
  outputIndex,
  allOutputs,
})}
${buildImageRule(allowImages)}
${buildIntentGuardrails(userPrompt)}
`.trim();

export const composeCritiquePrompt = ({
  plan,
  output,
  details,
  html,
  qualityScore,
  qualityViolations,
}: {
  plan: DesignPlan;
  output: PlannedOutput;
  details: string;
  html: string;
  qualityScore: number;
  qualityViolations: string[];
}) => {
  const htmlPreview = html.slice(0, 20_000);
  return `
You are Wirely's design critic. Evaluate whether the generated page faithfully and convincingly executes the plan.

Assess:
- fidelity to the planned layout strategy and required elements
- content depth and specificity
- distinctness of the art direction
- whether the page feels keepable as a first draft
- whether the downstream repair model should revise it

Output contract:
- Return a single JSON object only.
- Use these exact camelCase keys:
  summary, fidelityScore, depthScore, distinctnessScore, keepabilityScore,
  missingRequiredElements, majorIssues, recommendedFixes, shouldRepair
- Scores must be numbers in the 0-100 range.
- Arrays must contain concise strings; recommendedFixes must contain at least one entry.
- Do not use snake_case keys.

Plan:
${formatPlanOutput(output)}

Plan-wide mode: ${plan.generationMode}
Current DETAILS:
${details || "(empty)"}

Current quality score: ${qualityScore}
Current quality violations: ${qualityViolations.join(", ") || "none"}

Current HTML excerpt:
${htmlPreview}
`.trim();
};

export const composeRepairPrompt = ({
  plan,
  output,
  outputIndex,
  allOutputs,
  stylePreset,
  allowImages,
  userPrompt,
  critique,
  currentHtml,
}: {
  plan: DesignPlan;
  output: PlannedOutput;
  outputIndex: number;
  allOutputs: PlannedOutput[];
  stylePreset: WireStylePreset;
  allowImages: boolean;
  userPrompt: string;
  critique: Record<string, unknown>;
  currentHtml: string;
}) =>
  `
You are revising a generated HTML page that was too weak on the first pass.
Repair the page by addressing the critique while preserving the planned concept.

Return plain text only with DETAILS then HTML.

Plan-wide context:
- Artifact type: ${plan.artifactType}
- Audience: ${plan.audience}
- Brand summary: ${plan.brandSummary}
- Tone: ${plan.tone}
- Preset: ${stylePreset.name} (${stylePreset.id})
- Palette intent: ${plan.globalDesign.paletteIntent}
- Typography direction: ${plan.globalDesign.typographyDirection}
- Density: ${plan.globalDesign.density}
- Motion: ${plan.globalDesign.motion}
- Differentiation hook: ${plan.globalDesign.differentiationHook}

This output:
${formatPlanOutput(output)}

Critique JSON:
${JSON.stringify(critique, null, 2)}

Current HTML:
${currentHtml}

Repair rules:
- Fix the named issues directly.
- Preserve valid structure and the core concept.
- Increase specificity, hierarchy, and visual intentionality.
- Keep the result self-contained and deterministic for iframe rendering.
${composeConceptVariantDifferentiationRules({
  plan,
  outputIndex,
  allOutputs,
})}
${buildImageRule(allowImages)}
${buildIntentGuardrails(userPrompt)}
`.trim();

const composeBatchDetails = (plan: DesignPlan) => {
  const titles = plan.outputs.map((output) => output.title).join(", ");
  const modeLabel =
    plan.generationMode === "concept_variants"
      ? "distinct concept directions"
      : plan.generationMode === "information_architecture"
        ? "site architecture pages"
        : "focused page direction";

  return `${titles} form a ${modeLabel} set with ${plan.globalDesign.paletteIntent.toLowerCase()}. The collection leans on ${plan.globalDesign.differentiationHook.toLowerCase()} while staying aligned to ${plan.brandSummary.toLowerCase()}.`;
};

export const buildAssistantContent = ({
  plan,
  outputs,
}: {
  plan: DesignPlan;
  outputs: Array<{
    title: string;
    details: string;
    html: string;
    outputIndex: number;
  }>;
}) => {
  if (outputs.length <= 1) {
    const output = outputs[0];
    return [
      "DETAILS:",
      output?.details?.trim() ||
        `${output?.title ?? "Generated page"} delivers a polished first draft. It follows the planned direction with stronger hierarchy and richer content depth.`,
      "TITLE:",
      output?.title ?? "Generated page",
      "HTML:",
      output?.html ?? "",
    ].join("\n");
  }

  return [
    "DETAILS:",
    composeBatchDetails(plan),
    ...outputs.flatMap((output) => [
      `TITLE_${output.outputIndex + 1}:`,
      output.title,
      `HTML_${output.outputIndex + 1}:`,
      output.html,
    ]),
  ].join("\n");
};

export const resolveRequestedMode = ({
  requestedOutputCount,
  hasExplicitTargetPage,
}: {
  requestedOutputCount: number;
  hasExplicitTargetPage: boolean;
}): GenerationMode | undefined => {
  if (hasExplicitTargetPage || requestedOutputCount <= 1) {
    return "single_page";
  }

  return undefined;
};
