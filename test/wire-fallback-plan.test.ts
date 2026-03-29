import { describe, expect, it } from "bun:test";
import { buildFallbackDesignPlan } from "@/lib/wireFallbackPlan";
import { WIRE_STYLE_PRESETS } from "@/lib/wirePrompt";

describe("fallback design plan intent inference", () => {
  it("prefers explicit landing page intent over dashboard keywords in product names", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt:
        "Design a landing page for SERanking. Include product names like SEO Dashboard and AI Overviews Tracker.",
      requestedOutputCount: 1,
      targetPages: [{ id: "page-1", title: "Page 1" }],
      forceSinglePage: false,
      stylePreset: WIRE_STYLE_PRESETS[0],
    });

    expect(plan.artifactType).toBe("landing page");
  });

  it("builds clearly differentiated concept variants for multi-output fallback plans", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt: "Design a landing page for AI marketing automation.",
      requestedOutputCount: 2,
      targetPages: [
        { id: "page-1", title: "Page 1" },
        { id: "page-2", title: "Page 2" },
      ],
      forceSinglePage: false,
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
    });

    expect(plan.generationMode).toBe("concept_variants");
    expect(plan.outputs).toHaveLength(2);
    expect(plan.outputs[0].layoutStrategy).not.toBe(plan.outputs[1].layoutStrategy);
    expect(plan.outputs[0].requiredElements.join("|")).not.toBe(
      plan.outputs[1].requiredElements.join("|"),
    );
    expect(plan.outputs[0].sectionBlueprint[0]?.label).not.toBe(
      plan.outputs[1].sectionBlueprint[0]?.label,
    );
    expect(plan.outputs[0].pageRole).not.toBe(plan.outputs[1].pageRole);
    expect(plan.globalDesign.paletteIntent).toContain(
      "Each concept variant must clearly differ in palette mood",
    );
  });
});
