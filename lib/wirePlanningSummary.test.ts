import { describe, expect, it } from "bun:test";
import { buildWirePlanningSummary } from "@/lib/wirePlanningSummary";
import type { DesignPlan } from "@/lib/wireGenerationTypes";

const plan: DesignPlan = {
  generationMode: "single_page",
  artifactType: "marketing site",
  audience: "product leaders",
  brandSummary: "A planning tool for distributed teams.",
  tone: "confident and editorial",
  globalDesign: {
    presetId: "editorial",
    paletteIntent: "Warm neutrals with sharp black contrast",
    typographyDirection: "High-contrast serif headlines with clean sans body copy",
    density: "balanced",
    motion: "refined",
    differentiationHook: "A narrative split hero with anchored proof modules",
    stockImages: {
      enabled: true,
      visualIntent: "documentary team photography",
      keywords: ["product team", "planning workshop"],
    },
  },
  outputs: [
    {
      key: "home",
      title: "Homepage",
      outputKind: "page",
      pageRole: "Landing page",
      layoutStrategy: "Split hero with staggered proof rail",
      sectionBlueprint: [
        {
          id: "hero",
          label: "Hero",
          purpose: "Set the core value proposition",
          emphasis: "primary",
          layoutHint: "Two-column split hero",
        },
        {
          id: "proof",
          label: "Proof",
          purpose: "Show traction and testimonials",
          emphasis: "secondary",
          layoutHint: "Stacked proof cards",
        },
        {
          id: "cta",
          label: "CTA",
          purpose: "Drive conversion",
          emphasis: "supporting",
          layoutHint: "Centered action band",
        },
      ],
      requiredElements: ["hero headline", "customer logos", "cta"],
      imageSlots: [],
    },
  ],
};

describe("wire planning summary", () => {
  it("formats persisted planning text for the sidebar", () => {
    const summary = buildWirePlanningSummary({
      plan,
      designBrief: "Use strong editorial pacing and contrast throughout the page.",
    });

    expect(summary).toContain("Mode: single_page");
    expect(summary).toContain("Outputs:");
    expect(summary).toContain("Homepage");
    expect(summary).toContain("Design brief:");
  });
});
