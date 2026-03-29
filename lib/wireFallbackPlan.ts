import type { WireStylePreset } from "@/lib/wirePrompt";
import { inferRequestedArtifactType } from "@/lib/wireIntent";
import type {
  DesignPlan,
  GenerationMode,
  PlannedOutput,
} from "@/lib/wireGenerationTypes";

const parseList = (value: string | undefined) => {
  if (!value) return [];
  return value
    .replace(/^[^\[]*\[/, "")
    .replace(/\][^\]]*$/, "")
    .split(",")
    .map((item) => item.replace(/["']/g, "").trim())
    .filter(Boolean);
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const inferArtifactType = (prompt: string) => inferRequestedArtifactType(prompt);

const inferGenerationMode = ({
  requestedOutputCount,
  forceSinglePage,
  prompt,
}: {
  requestedOutputCount: number;
  forceSinglePage: boolean;
  prompt: string;
}): GenerationMode => {
  if (forceSinglePage || requestedOutputCount <= 1) {
    return "single_page";
  }

  const text = prompt.toLowerCase();
  if (
    /(home|homepage|features|pricing|contact|about|faq|site map|sitemap|multi-page|multiple pages|pages:)/.test(
      text,
    )
  ) {
    return "information_architecture";
  }

  return "concept_variants";
};

const conceptTitlesByPreset: Record<string, string[]> = {
  "technical-grid": ["Signal Grid", "Operator Atlas", "Search Command"],
  "editorial-light": ["Editorial Analyst", "Founder's Brief", "Proof Ledger"],
  "warm-minimal": ["Warm Orbit", "Guided Clarity", "Calm Conversion"],
  "brutalist-clean": ["Hard Signal", "Impact Field", "Blackline Motion"],
  "premium-dark": ["Midnight Authority", "Emerald Ledger", "Cyan Reserve"],
};

interface ConceptVariantProfile {
  roleLabel: string;
  layoutStrategy: string;
  requiredElements: string[];
  sectionLabels: string[];
}

const landingConceptProfiles: ConceptVariantProfile[] = [
  {
    roleLabel: "conversion funnel concept",
    layoutStrategy:
      "Center a high-conversion funnel with generous whitespace, warm surfaces, and a direct CTA hierarchy from hero to close.",
    requiredElements: [
      "hero value proposition",
      "proof rail with customer signals",
      "conversion-focused primary cta",
    ],
    sectionLabels: ["Hero Story", "Product Value", "Proof", "Conversion CTA"],
  },
  {
    roleLabel: "editorial narrative concept",
    layoutStrategy:
      "Use an editorial split layout with oversized type, asymmetric content rhythm, and cooler accent blocks that frame trust content.",
    requiredElements: [
      "editorial manifesto hero",
      "narrative product walkthrough",
      "evidence-led comparison block",
    ],
    sectionLabels: ["Manifesto Hero", "Narrative Product Tour", "Evidence Grid", "Action Panel"],
  },
  {
    roleLabel: "modular product atlas concept",
    layoutStrategy:
      "Build a denser modular composition with strong borders, stacked product modules, and high-contrast accent zones for a bold theme shift.",
    requiredElements: [
      "modular hero module",
      "feature atlas matrix",
      "stacked call-to-action rail",
    ],
    sectionLabels: ["Launch Panel", "Feature Atlas", "Use-Case Modules", "Activation Rail"],
  },
];

const dashboardConceptProfiles: ConceptVariantProfile[] = [
  {
    roleLabel: "command center concept",
    layoutStrategy:
      "Establish an operations command center with an anchored sidebar, top KPI rail, and calm analytical density.",
    requiredElements: [
      "sidebar navigation",
      "kpi summary rail",
      "primary analysis panels",
    ],
    sectionLabels: ["Executive Overview", "KPI Command Rail", "Trend Analysis", "Decision Actions"],
  },
  {
    roleLabel: "analyst workstation concept",
    layoutStrategy:
      "Use an asymmetric analyst workstation layout with a persistent insight column, cooler accents, and a narrative diagnostics flow.",
    requiredElements: [
      "context switch controls",
      "diagnostic comparison modules",
      "insight recommendation panel",
    ],
    sectionLabels: ["Context Header", "Diagnostic Workspace", "Comparative Signals", "Recommendations"],
  },
  {
    roleLabel: "high-density mission board concept",
    layoutStrategy:
      "Compose a denser mission board with segmented data zones, stronger contrast blocks, and layered status modules for urgency.",
    requiredElements: [
      "status priority board",
      "segmented metric zones",
      "action queue table",
    ],
    sectionLabels: ["Mission Header", "Priority Board", "Segmented Metrics", "Action Queue"],
  },
];

const defaultConceptProfiles: ConceptVariantProfile[] = [
  {
    roleLabel: "balanced showcase concept",
    layoutStrategy:
      "Create a balanced showcase layout with clear narrative flow and restrained contrast to establish baseline clarity.",
    requiredElements: [
      "hero entry section",
      "core content grouping",
      "primary action path",
    ],
    sectionLabels: ["Hero", "Core Content", "Proof", "CTA"],
  },
  {
    roleLabel: "editorial contrast concept",
    layoutStrategy:
      "Shift to editorial contrast with asymmetry, stronger typographic drama, and bolder sectional pacing than the baseline concept.",
    requiredElements: [
      "editorial headline zone",
      "narrative supporting modules",
      "evidence-first trust section",
    ],
    sectionLabels: ["Headline Narrative", "Support Modules", "Evidence", "CTA"],
  },
  {
    roleLabel: "modular intensity concept",
    layoutStrategy:
      "Use a modular intensity layout with denser grouped blocks, pronounced visual separators, and assertive action framing.",
    requiredElements: [
      "modular launch section",
      "grouped solution matrix",
      "stacked action framework",
    ],
    sectionLabels: ["Launch", "Solution Matrix", "Deep Dive Modules", "Action Framework"],
  },
];

const resolveConceptVariantProfile = ({
  artifactType,
  outputIndex,
}: {
  artifactType: string;
  outputIndex: number;
}): ConceptVariantProfile => {
  const profiles =
    artifactType === "dashboard"
      ? dashboardConceptProfiles
      : artifactType === "landing page" || artifactType === "marketing page"
        ? landingConceptProfiles
        : defaultConceptProfiles;

  return profiles[outputIndex] ?? profiles[profiles.length - 1];
};

const buildSectionBlueprint = ({
  labels,
  outputTitle,
}: {
  labels: string[];
  outputTitle: string;
}) =>
  labels.map((label, index) => ({
    id: slugify(label || `section-${index + 1}`),
    label,
    purpose:
      index === 0
        ? `Establish ${outputTitle} with strong hierarchy and immediate relevance.`
        : `Support the page narrative through ${label.toLowerCase()}.`,
    emphasis: index <= 1 ? ("primary" as const) : ("secondary" as const),
    layoutHint:
      index === 0
        ? "Lead with a high-contrast opening composition and direct action."
        : "Use a clearly grouped content block with strong rhythm and contrast.",
  }));

const defaultSectionLabels = (artifactType: string) => {
  if (artifactType === "dashboard") {
    return ["Overview", "Key Metrics", "Analysis", "Recommendations"];
  }

  return ["Hero", "Featured Tools", "Proof", "Closing CTA"];
};

const buildOutput = ({
  title,
  outputKind,
  pageRole,
  artifactType,
  layoutStrategy,
  requiredElements,
  sectionLabels,
}: {
  title: string;
  outputKind: "page" | "concept";
  pageRole: string;
  artifactType: string;
  layoutStrategy: string;
  requiredElements: string[];
  sectionLabels: string[];
}): PlannedOutput => ({
  key: slugify(title) || slugify(pageRole) || "output",
  title,
  outputKind,
  conceptName: outputKind === "concept" ? title : undefined,
  pageRole,
  layoutStrategy,
  requiredElements,
  sectionBlueprint: buildSectionBlueprint({
    labels: sectionLabels.length >= 3 ? sectionLabels : defaultSectionLabels(artifactType),
    outputTitle: title,
  }),
});

const buildOutputs = ({
  generationMode,
  artifactType,
  requestedOutputCount,
  targetPages,
  stylePreset,
  malformedSeed,
}: {
  generationMode: GenerationMode;
  artifactType: string;
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  stylePreset: WireStylePreset;
  malformedSeed?: unknown;
}) => {
  const seedRecord =
    malformedSeed && typeof malformedSeed === "object" && !Array.isArray(malformedSeed)
      ? (malformedSeed as Record<string, unknown>)
      : null;
  const designPlanArray = Array.isArray(seedRecord?.designPlan)
    ? (seedRecord?.designPlan as unknown[])
    : [];
  const layoutStrategySeed =
    typeof designPlanArray[7] === "string"
      ? designPlanArray[7]
      : artifactType === "dashboard"
        ? "Use a dense analytical layout with a strong metrics hierarchy."
        : "Lead with a memorable hero, then move through grouped proof and product depth.";
  const requiredElementsSeed = parseList(
    typeof designPlanArray[8] === "string"
      ? designPlanArray[8]
      : undefined,
  );
  const sectionSeed = parseList(
    typeof designPlanArray[9] === "string"
      ? designPlanArray[9]
      : undefined,
  );

  if (generationMode === "single_page") {
    const targetTitle = targetPages[0]?.title || "Page 1";
    return [
      buildOutput({
        title: targetTitle,
        outputKind: "page",
        pageRole: artifactType,
        artifactType,
        layoutStrategy: layoutStrategySeed,
        requiredElements:
          requiredElementsSeed.length >= 3
            ? requiredElementsSeed
            : artifactType === "dashboard"
              ? ["sidebar navigation", "kpi cards", "charts"]
              : ["hero section", "feature group", "cta"],
        sectionLabels: sectionSeed,
      }),
    ];
  }

  if (generationMode === "information_architecture") {
    const defaultTitles = ["Home", "Features", "Pricing"];
    return Array.from({ length: requestedOutputCount }, (_, index) => {
      const title =
        targetPages[index]?.title && !/^page\s+\d+$/i.test(targetPages[index].title)
          ? targetPages[index].title
          : defaultTitles[index] ?? `Page ${index + 1}`;
      const pageRole =
        title === "Home"
          ? "homepage"
          : title.toLowerCase() === "pricing"
            ? "pricing page"
            : `${title.toLowerCase()} page`;

      return buildOutput({
        title,
        outputKind: "page",
        pageRole,
        artifactType,
        layoutStrategy:
          index === 0
            ? "Lead with the core category story and strongest product narrative."
            : `Design a dedicated ${pageRole} with purpose-built hierarchy and content grouping.`,
        requiredElements:
          index === 0
            ? ["hero section", "product family overview", "primary cta"]
            : title === "Pricing"
              ? ["pricing tiers", "feature comparison", "decision cta"]
              : ["section headline", "content groups", "cta"],
        sectionLabels:
          index === 0
            ? ["Hero", "Platform Overview", "Proof", "CTA"]
            : title === "Pricing"
              ? ["Plan Intro", "Pricing Grid", "Comparison", "CTA"]
              : ["Hero", "Core Content", "Supporting Detail", "CTA"],
      });
    });
  }

  const conceptTitles =
    conceptTitlesByPreset[stylePreset.id] ??
    ["Concept One", "Concept Two", "Concept Three"];

  return Array.from({ length: requestedOutputCount }, (_, index) =>
    (() => {
      const profile = resolveConceptVariantProfile({
        artifactType,
        outputIndex: index,
      });
      const title = conceptTitles[index] ?? `Concept ${index + 1}`;
      return buildOutput({
        title,
        outputKind: "concept",
        pageRole: `${artifactType} (${profile.roleLabel})`,
        artifactType,
        layoutStrategy: profile.layoutStrategy,
        requiredElements: profile.requiredElements,
        sectionLabels: profile.sectionLabels,
      });
    })(),
  );
};

export const buildFallbackDesignPlan = ({
  userPrompt,
  requestedOutputCount,
  targetPages,
  forceSinglePage,
  stylePreset,
  malformedSeed,
}: {
  userPrompt: string;
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  forceSinglePage: boolean;
  stylePreset: WireStylePreset;
  malformedSeed?: unknown;
}): DesignPlan => {
  const seedRecord =
    malformedSeed && typeof malformedSeed === "object" && !Array.isArray(malformedSeed)
      ? (malformedSeed as Record<string, unknown>)
      : null;
  const designPlanArray = Array.isArray(seedRecord?.designPlan)
    ? (seedRecord?.designPlan as unknown[])
    : [];

  const artifactType =
    (typeof designPlanArray[3] === "string" && designPlanArray[3]) ||
    inferArtifactType(userPrompt);
  const generationMode =
    (seedRecord?.outputKind === "single_page" ||
    seedRecord?.outputKind === "concept_variants" ||
    seedRecord?.outputKind === "information_architecture"
      ? (seedRecord.outputKind as GenerationMode)
      : null) ??
    inferGenerationMode({
      requestedOutputCount,
      forceSinglePage,
      prompt: userPrompt,
    });
  const audience =
    (typeof designPlanArray[4] === "string" && designPlanArray[4]) ||
    (artifactType === "dashboard"
      ? "Operators who need data-dense decision support."
      : "Prospects evaluating the product quickly and visually.");
  const brandSummary =
    (typeof designPlanArray[5] === "string" && designPlanArray[5]) ||
    userPrompt.slice(0, 220);
  const variantDifferentiationNote =
    generationMode === "concept_variants" && requestedOutputCount > 1
      ? "Each concept variant must clearly differ in palette mood, typography tone, and composition rhythm."
      : null;

  return {
    generationMode,
    artifactType,
    audience,
    brandSummary,
    tone:
      artifactType === "dashboard"
        ? "precise and analytical"
        : "confident and conversion-oriented",
    globalDesign: {
      presetId: stylePreset.id,
      paletteIntent: variantDifferentiationNote
        ? `${stylePreset.palette} ${variantDifferentiationNote}`
        : stylePreset.palette,
      typographyDirection: variantDifferentiationNote
        ? `${stylePreset.typography} Vary heading/body personality across variants while preserving brand consistency.`
        : stylePreset.typography,
      density: artifactType === "dashboard" ? "dense" : "balanced",
      motion: stylePreset.motion.includes("Minimal")
        ? "minimal"
        : stylePreset.motion.includes("Micro") || stylePreset.motion.includes("Refined")
          ? "refined"
          : "bold",
      differentiationHook: variantDifferentiationNote
        ? `${stylePreset.intent} Keep variants visually non-overlapping in first-screen impression.`
        : stylePreset.intent,
    },
    outputs: buildOutputs({
      generationMode,
      artifactType,
      requestedOutputCount,
      targetPages,
      stylePreset,
      malformedSeed,
    }),
  };
};
