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
          stockImages: {
            enabled: false,
            visualIntent: "No stock imagery required for this concept set.",
            keywords: ["seo", "analytics"],
          },
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
            imageSlots: [],
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
            imageSlots: [],
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
            stockImages: {
              enabled: false,
              visualIntent: "No stock images required.",
              keywords: ["landing", "product"],
            },
          },
          outputs: [],
        },
        expectedOutputCount: 1,
      }),
    ).toThrow();
  });

  it("recovers a valid design plan wrapped under designPlan", () => {
    const plan = validateDesignPlan({
      value: {
        designPlan: {
          generationMode: "single_page",
          artifactType: "landing page",
          audience: "SEO leaders at SaaS companies",
          brandSummary: "Platform for SEO and AI search visibility.",
          tone: "clear",
          globalDesign: {
            presetId: "technical-grid",
            paletteIntent: "Slate with cyan accents and clear tonal contrast.",
            typographyDirection: "Geometric sans with readable body pairing.",
            density: "balanced",
            motion: "minimal",
            differentiationHook: "Operational clarity over decoration.",
            stockImages: {
              enabled: true,
              visualIntent: "Use restrained editorial imagery to support trust.",
              keywords: ["team", "workspace", "product"],
            },
          },
          outputs: [
            {
              key: "home",
              title: "Home",
              outputKind: "page",
              pageRole: "homepage",
              layoutStrategy: "Lead with a clear hero and grouped proof sections.",
              sectionBlueprint: [
                {
                  id: "hero",
                  label: "Hero",
                  purpose: "Introduce the platform with authority.",
                  emphasis: "primary",
                  layoutHint: "Split hero with strong CTA focus.",
                },
                {
                  id: "features",
                  label: "Features",
                  purpose: "Explain the core product value.",
                  emphasis: "primary",
                  layoutHint: "Grid of grouped feature blocks.",
                },
                {
                  id: "proof",
                  label: "Proof",
                  purpose: "Build trust with customer and metric signals.",
                  emphasis: "secondary",
                  layoutHint: "Use testimonials and stat highlights.",
                },
              ],
              requiredElements: ["hero", "features", "cta"],
              imageSlots: [
                {
                  id: "hero-1",
                  sectionId: "hero",
                  query: "modern product team collaborating",
                  aspectRatio: "16:9",
                  priority: "hero",
                  altHint: "Editorial hero image supporting the product narrative.",
                },
              ],
            },
          ],
        },
      },
      expectedOutputCount: 1,
      requestedMode: "single_page",
    });

    expect(plan.generationMode).toBe("single_page");
    expect(plan.outputs).toHaveLength(1);
    expect(plan.outputs[0]?.imageSlots[0]?.id).toBe("hero-1");
  });
});
