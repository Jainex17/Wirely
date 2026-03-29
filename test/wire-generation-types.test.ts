import { describe, expect, it } from "bun:test";
import { validateDesignPlan } from "@/lib/wireGenerationTypes";

describe("wire generation plan validation", () => {
  it("normalizes concept variant outputs and enforces requested count", () => {
    const plan = validateDesignPlan({
      value: {
        generationMode: "concept_variants",
        artifactType: "landing page",
        audience: "SEO leaders at mid-market SaaS companies",
        brandSummary: "SEO and AI visibility platform for in-house teams.",
        tone: "confident",
        globalDesign: {
          presetId: "technical-grid",
          paletteIntent: "Slate surfaces with electric cyan accents.",
          typographyDirection: "Geometric display paired with readable sans.",
          density: "balanced",
          motion: "refined",
          differentiationHook: "A command-center feel with analytical depth.",
        },
        outputs: [
          {
            key: "signal-grid",
            title: "Signal Grid",
            outputKind: "page",
            pageRole: "marketing overview",
            layoutStrategy: "Split hero with dense modular sections and proof rail.",
            sectionBlueprint: [
              {
                id: "hero",
                label: "Hero",
                purpose: "Introduce the platform with authority.",
                emphasis: "primary",
                layoutHint: "Offset two-column hero with live metrics block.",
              },
              {
                id: "tool-suite",
                label: "Tool Suite",
                purpose: "Show the breadth of the product family.",
                emphasis: "primary",
                layoutHint: "Measured grid with featured and support cards.",
              },
              {
                id: "proof",
                label: "Proof",
                purpose: "Build trust with customer and data signals.",
                emphasis: "secondary",
                layoutHint: "Horizontal stat rail plus customer logos.",
              },
            ],
            requiredElements: ["hero", "tool cards", "proof section"],
          },
          {
            key: "editorial-analyst",
            title: "Editorial Analyst",
            outputKind: "page",
            conceptName: "Editorial Analyst",
            pageRole: "marketing overview",
            layoutStrategy: "Asymmetric editorial narrative with sidebar proof modules.",
            sectionBlueprint: [
              {
                id: "hero",
                label: "Hero",
                purpose: "Lead with the AI visibility story.",
                emphasis: "primary",
                layoutHint: "Large editorial headline beside benchmark panel.",
              },
              {
                id: "products",
                label: "Products",
                purpose: "Group platform areas into digestible families.",
                emphasis: "primary",
                layoutHint: "Alternating editorial bands with grouped product lists.",
              },
              {
                id: "cta",
                label: "CTA",
                purpose: "Move the user toward trial or demo.",
                emphasis: "secondary",
                layoutHint: "Full-width closing panel with dual actions.",
              },
            ],
            requiredElements: ["hero", "grouped product families", "cta"],
          },
        ],
      },
      expectedOutputCount: 2,
    });

    expect(plan.outputs[0].outputKind).toBe("concept");
    expect(plan.outputs[0].conceptName).toBe("Signal Grid");
    expect(plan.outputs[1].outputKind).toBe("concept");
  });

  it("rejects output-count mismatches", () => {
    expect(() =>
      validateDesignPlan({
        value: {
          generationMode: "single_page",
          artifactType: "landing page",
          audience: "SEO leads",
          brandSummary: "Platform for SEO and AI search visibility.",
          tone: "clear",
          globalDesign: {
            presetId: "technical-grid",
            paletteIntent: "Slate with cyan accents.",
            typographyDirection: "Geometric sans with readable body.",
            density: "balanced",
            motion: "minimal",
            differentiationHook: "Operational clarity over decoration.",
          },
          outputs: [],
        },
        expectedOutputCount: 1,
      }),
    ).toThrow();
  });
});
