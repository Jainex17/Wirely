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
  requestedMode,
  prompt,
}: {
  requestedOutputCount: number;
  forceSinglePage: boolean;
  requestedMode?: GenerationMode;
  prompt: string;
}): GenerationMode => {
  if (forceSinglePage || requestedOutputCount <= 1) {
    return "single_page";
  }

  if (requestedMode) {
    return requestedMode;
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

const inferStockImageEnabled = (prompt: string) => {
  return /\b(hero|gallery|showcase|visual|photo|photos|image|images)\b/i.test(prompt);
};

const defaultStockKeywords = (artifactType: string) => {
  if (artifactType === "dashboard") {
    return ["workspace", "data", "technology"];
  }
  if (artifactType === "landing page" || artifactType === "marketing page") {
    return ["product", "team", "workspace"];
  }
  return ["product", "interface", "design"];
};

const buildImageSlotsForOutput = ({
  enabled,
  artifactType,
  outputIndex,
}: {
  enabled: boolean;
  artifactType: string;
  outputIndex: number;
}): PlannedOutput["imageSlots"] => {
  if (!enabled) return [];
  if (artifactType === "dashboard") return [];

  return [
    {
      id: `hero-${outputIndex + 1}`,
      sectionId: "hero",
      query:
        artifactType === "landing page" || artifactType === "marketing page"
          ? "modern product team collaborating"
          : "modern digital workspace",
      aspectRatio: "16:9",
      priority: "hero",
      altHint: "Editorial hero image supporting the product narrative.",
    },
    {
      id: `support-${outputIndex + 1}`,
      sectionId: "proof",
      query:
        artifactType === "landing page" || artifactType === "marketing page"
          ? "customer success team in office"
          : "creative team workshop",
      aspectRatio: "4:3",
      priority: "supporting",
      altHint: "Supporting image reinforcing trust and momentum.",
    },
  ];
};

const buildOutput = ({
  title,
  outputKind,
  pageRole,
  artifactType,
  layoutStrategy,
  requiredElements,
  sectionLabels,
  imageSlots,
}: {
  title: string;
  outputKind: "page" | "concept";
  pageRole: string;
  artifactType: string;
  layoutStrategy: string;
  requiredElements: string[];
  sectionLabels: string[];
  imageSlots: PlannedOutput["imageSlots"];
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
  imageSlots,
});

const resolveInformationArchitectureProfile = (title: string) => {
  const normalizedTitle = title.trim().toLowerCase();

  if (normalizedTitle === "home") {
    return {
      pageRole: "homepage",
      layoutStrategy:
        "Lead with the core category story, strongest value proposition, and a clear navigation spine into the rest of the site.",
      requiredElements: [
        "hero section",
        "product overview",
        "navigation to key site pages",
      ],
      sectionLabels: ["Hero", "Platform Overview", "Proof", "Primary CTA"],
    };
  }

  if (normalizedTitle === "about") {
    return {
      pageRole: "about page",
      layoutStrategy:
        "Design a trust-building about page that foregrounds the company story, team credibility, and values instead of a conversion-heavy homepage hero.",
      requiredElements: ["brand story", "team or founder section", "values or principles"],
      sectionLabels: ["Intro", "Story", "Team", "Values"],
    };
  }

  if (normalizedTitle === "contact") {
    return {
      pageRole: "contact page",
      layoutStrategy:
        "Design a utility-first contact page with clear contact paths, support details, and a prominent form instead of a narrative homepage layout.",
      requiredElements: ["contact form", "contact methods", "support or office details"],
      sectionLabels: ["Contact Intro", "Contact Form", "Reach Us", "Support Details"],
    };
  }

  if (normalizedTitle === "pricing") {
    return {
      pageRole: "pricing page",
      layoutStrategy:
        "Design a decision-oriented pricing page with transparent tiers, comparison detail, and strong purchase confidence cues.",
      requiredElements: ["pricing tiers", "feature comparison", "decision cta"],
      sectionLabels: ["Plan Intro", "Pricing Grid", "Comparison", "Decision CTA"],
    };
  }

  if (normalizedTitle === "features") {
    return {
      pageRole: "features page",
      layoutStrategy:
        "Design a product-depth features page with grouped capabilities, use-case framing, and supporting proof rather than a broad homepage overview.",
      requiredElements: ["feature groups", "use-case detail", "supporting proof"],
      sectionLabels: ["Feature Hero", "Capability Groups", "Use Cases", "Proof"],
    };
  }

  return {
    pageRole: `${normalizedTitle} page`,
    layoutStrategy: `Design a dedicated ${normalizedTitle} page with purpose-built hierarchy and content grouping for that page's job, not a generic homepage layout.`,
    requiredElements: ["section headline", "content groups", "page-specific cta"],
    sectionLabels: ["Intro", "Core Content", "Supporting Detail", "CTA"],
  };
};

const buildOutputs = ({
  generationMode,
  artifactType,
  requestedOutputCount,
  targetPages,
  stylePreset,
  malformedSeed,
  stockImagesEnabled,
}: {
  generationMode: GenerationMode;
  artifactType: string;
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  stylePreset: WireStylePreset;
  malformedSeed?: unknown;
  stockImagesEnabled: boolean;
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
        imageSlots: buildImageSlotsForOutput({
          enabled: stockImagesEnabled,
          artifactType,
          outputIndex: 0,
        }),
      }),
    ];
  }

  if (generationMode === "information_architecture") {
    const defaultTitles =
      requestedOutputCount === 2 ? ["Home", "About"] : ["Home", "About", "Contact"];
    return Array.from({ length: requestedOutputCount }, (_, index) => {
      const title =
        targetPages[index]?.title && !/^page\s+\d+$/i.test(targetPages[index].title)
          ? targetPages[index].title
          : defaultTitles[index] ?? `Page ${index + 1}`;
      const profile = resolveInformationArchitectureProfile(title);

      return buildOutput({
        title,
        outputKind: "page",
        pageRole: profile.pageRole,
        artifactType,
        layoutStrategy: profile.layoutStrategy,
        requiredElements: profile.requiredElements,
        sectionLabels: profile.sectionLabels,
        imageSlots: buildImageSlotsForOutput({
          enabled: stockImagesEnabled,
          artifactType,
          outputIndex: index,
        }),
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
        imageSlots: buildImageSlotsForOutput({
          enabled: stockImagesEnabled,
          artifactType,
          outputIndex: index,
        }),
      });
    })(),
  );
};

export const buildFallbackDesignPlan = ({
  userPrompt,
  requestedOutputCount,
  targetPages,
  forceSinglePage,
  requestedMode,
  stylePreset,
  malformedSeed,
}: {
  userPrompt: string;
  requestedOutputCount: number;
  targetPages: Array<{ id: string; title: string; html?: string }>;
  forceSinglePage: boolean;
  requestedMode?: GenerationMode;
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
      requestedMode,
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
  const stockImagesEnabled = inferStockImageEnabled(userPrompt);

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
      stockImages: {
        enabled: stockImagesEnabled,
        visualIntent:
          artifactType === "dashboard"
            ? "Keep imagery restrained and contextual."
            : "Use editorial photography to support narrative sections.",
        keywords: defaultStockKeywords(artifactType),
      },
    },
    outputs: buildOutputs({
      generationMode,
      artifactType,
      requestedOutputCount,
      targetPages,
      stylePreset,
      malformedSeed,
      stockImagesEnabled,
    }),
  };
};
