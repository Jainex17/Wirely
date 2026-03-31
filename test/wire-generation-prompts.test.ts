import { describe, expect, it } from "bun:test";
import {
  buildAssistantContent,
  composePlannedGenerateSystemPrompt,
} from "@/lib/wireGenerationPrompts";
import type { DesignPlan } from "@/lib/wireGenerationTypes";
import { WIRE_STYLE_PRESETS } from "@/lib/wirePrompt";

const conceptPlan: DesignPlan = {
  generationMode: "concept_variants",
  artifactType: "landing page",
  audience: "Growth teams at early-stage SaaS companies",
  brandSummary: "AI assistant for campaign planning and execution.",
  tone: "confident",
  globalDesign: {
    presetId: "warm-minimal",
    paletteIntent: "Warm neutrals with one saturated accent and quiet secondary tones.",
    typographyDirection: "Humanist sans pairing with strong heading contrast.",
    density: "balanced",
    motion: "refined",
    differentiationHook: "Calm conversion-oriented storytelling.",
    stockImages: {
      enabled: true,
      visualIntent: "Use editorial stock photography to support trust and narrative flow.",
      keywords: ["marketing", "team", "workspace"],
    },
  },
  outputs: [
    {
      key: "warm-orbit",
      title: "Warm Orbit",
      outputKind: "concept",
      conceptName: "Warm Orbit",
      pageRole: "landing page (conversion funnel concept)",
      layoutStrategy:
        "Center a high-conversion funnel with generous whitespace and direct CTA hierarchy.",
      sectionBlueprint: [
        {
          id: "hero-story",
          label: "Hero Story",
          purpose: "Establish value proposition quickly.",
          emphasis: "primary",
          layoutHint: "Center-weighted hero with clear conversion path.",
        },
        {
          id: "proof",
          label: "Proof",
          purpose: "Add evidence and trust signals.",
          emphasis: "secondary",
          layoutHint: "Horizontal social proof rail with stats.",
        },
        {
          id: "cta",
          label: "Conversion CTA",
          purpose: "Drive the next action.",
          emphasis: "secondary",
          layoutHint: "Distinct close section with high-contrast action area.",
        },
      ],
      requiredElements: ["hero value proposition", "proof rail", "primary cta"],
      imageSlots: [
        {
          id: "hero-1",
          sectionId: "hero-story",
          query: "startup team collaboration",
          aspectRatio: "16:9",
          priority: "hero",
          altHint: "Team collaborating around campaign dashboard.",
        },
      ],
    },
    {
      key: "guided-clarity",
      title: "Guided Clarity",
      outputKind: "concept",
      conceptName: "Guided Clarity",
      pageRole: "landing page (editorial narrative concept)",
      layoutStrategy:
        "Use an editorial split layout with oversized type and asymmetrical narrative pacing.",
      sectionBlueprint: [
        {
          id: "manifesto",
          label: "Manifesto Hero",
          purpose: "Lead with a bold narrative thesis.",
          emphasis: "primary",
          layoutHint: "Asymmetric split hero with typographic drama.",
        },
        {
          id: "tour",
          label: "Narrative Product Tour",
          purpose: "Walk through product depth with story framing.",
          emphasis: "primary",
          layoutHint: "Alternating split sections with guided storytelling.",
        },
        {
          id: "panel",
          label: "Action Panel",
          purpose: "Push toward conversion.",
          emphasis: "secondary",
          layoutHint: "Right-anchored closing action panel.",
        },
      ],
      requiredElements: [
        "editorial manifesto hero",
        "narrative product walkthrough",
        "comparison block",
      ],
      imageSlots: [
        {
          id: "hero-2",
          sectionId: "manifesto",
          query: "editorial workspace portrait",
          aspectRatio: "4:3",
          priority: "hero",
          altHint: "Editorial workspace setting with focused team.",
        },
      ],
    },
  ],
};

describe("planned generation prompt", () => {
  it("adds concept variant uniqueness constraints for multi-output plans", () => {
    const prompt = composePlannedGenerateSystemPrompt({
      plan: conceptPlan,
      output: conceptPlan.outputs[0],
      outputIndex: 0,
      allOutputs: conceptPlan.outputs,
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
      allowImages: false,
      userPrompt: "Design two distinct landing page concepts for an AI marketing SaaS.",
    });

    expect(prompt).toContain("Variant uniqueness constraints (critical)");
    expect(prompt).toContain("concept variant 1 of 2");
    expect(prompt).toContain("Guided Clarity");
    expect(prompt).toContain("Do not mirror sibling hero composition");
  });

  it("keeps assistant content focused on summary details without exposing plan lines", () => {
    const message = buildAssistantContent({
      plan: conceptPlan,
      outputs: [
        {
          outputIndex: 0,
          title: "Warm Orbit",
          details: "Warm Orbit applies a focused conversion funnel.",
          html: "<!doctype html><html><body><main>First</main></body></html>",
        },
        {
          outputIndex: 1,
          title: "Guided Clarity",
          details: "Guided Clarity uses an editorial narrative frame.",
          html: "<!doctype html><html><body><main>Second</main></body></html>",
        },
      ],
    });

    expect(message).toContain("DETAILS:");
    expect(message).toContain("Warm Orbit, Guided Clarity form a");
    expect(message).not.toContain("Plan:");
  });
});
