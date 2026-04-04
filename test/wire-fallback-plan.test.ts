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

  it("respects an explicit website-pages request mode for generic multi-output prompts", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt: "Design a modern website for an AI marketing automation product.",
      requestedOutputCount: 3,
      targetPages: [
        { id: "page-1", title: "Page 1" },
        { id: "page-2", title: "Page 2" },
        { id: "page-3", title: "Page 3" },
      ],
      forceSinglePage: false,
      requestedMode: "information_architecture",
      stylePreset: WIRE_STYLE_PRESETS[0],
    });

    expect(plan.generationMode).toBe("information_architecture");
    expect(plan.outputs.map((output) => output.title)).toEqual([
      "Home",
      "About",
      "Contact",
    ]);
    expect(plan.outputs.every((output) => output.outputKind === "page")).toBe(true);
  });

  it("gives two-page website mode a distinct home and about split by default", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt: "Design a modern website for an AI marketing automation product.",
      requestedOutputCount: 2,
      targetPages: [
        { id: "page-1", title: "Page 1" },
        { id: "page-2", title: "Page 2" },
      ],
      forceSinglePage: false,
      requestedMode: "information_architecture",
      stylePreset: WIRE_STYLE_PRESETS[0],
    });

    expect(plan.outputs.map((output) => output.title)).toEqual(["Home", "About"]);
    expect(plan.outputs[0]?.pageRole).toBe("homepage");
    expect(plan.outputs[1]?.pageRole).toBe("about page");
    expect(plan.outputs[0]?.layoutStrategy).not.toBe(plan.outputs[1]?.layoutStrategy);
  });

  it("respects an explicit concepts request mode even when the prompt mentions site pages", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt:
        "Design three options for a website with home, about, and contact directions for an AI marketing automation product.",
      requestedOutputCount: 3,
      targetPages: [
        { id: "page-1", title: "Page 1" },
        { id: "page-2", title: "Page 2" },
        { id: "page-3", title: "Page 3" },
      ],
      forceSinglePage: false,
      requestedMode: "concept_variants",
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
    });

    expect(plan.generationMode).toBe("concept_variants");
    expect(plan.outputs.every((output) => output.outputKind === "concept")).toBe(true);
  });

  it("does not force stock images on fallback landing pages unless requested", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt: "Design a landing page for an AI marketing automation product.",
      requestedOutputCount: 1,
      targetPages: [{ id: "page-1", title: "Page 1" }],
      forceSinglePage: true,
      stylePreset: WIRE_STYLE_PRESETS[0],
    });

    expect(plan.globalDesign.stockImages.enabled).toBe(false);
    expect(plan.outputs[0]?.imageSlots).toEqual([]);
  });

  it("enables stock images on fallback plans when the prompt explicitly requests imagery", () => {
    const plan = buildFallbackDesignPlan({
      userPrompt:
        "Design a landing page for an AI marketing automation product with a strong hero image and supporting photos.",
      requestedOutputCount: 1,
      targetPages: [{ id: "page-1", title: "Page 1" }],
      forceSinglePage: true,
      stylePreset: WIRE_STYLE_PRESETS[0],
    });

    expect(plan.globalDesign.stockImages.enabled).toBe(true);
    expect(plan.outputs[0]?.imageSlots.length).toBeGreaterThan(0);
  });
});
