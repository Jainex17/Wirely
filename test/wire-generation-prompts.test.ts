import { describe, expect, it } from "bun:test";
import {
  buildAssistantContent,
  composeDesignBriefPrompt,
  composePageEditSystemPrompt,
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

const informationArchitecturePlan: DesignPlan = {
  generationMode: "information_architecture",
  artifactType: "marketing page",
  audience: "Prospects evaluating the product quickly and visually.",
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
      enabled: false,
      visualIntent: "Keep imagery restrained.",
      keywords: ["product", "team", "workspace"],
    },
  },
  outputs: [
    {
      key: "home",
      title: "Home",
      outputKind: "page",
      pageRole: "homepage",
      layoutStrategy:
        "Lead with the core category story, strongest value proposition, and a clear navigation spine into the rest of the site.",
      sectionBlueprint: [
        {
          id: "hero",
          label: "Hero",
          purpose: "Introduce the product and route deeper into the site.",
          emphasis: "primary",
          layoutHint: "Clear hero with navigation and primary CTA.",
        },
        {
          id: "overview",
          label: "Platform Overview",
          purpose: "Summarize the product value.",
          emphasis: "primary",
          layoutHint: "Layered overview modules.",
        },
        {
          id: "proof",
          label: "Proof",
          purpose: "Add trust and evidence.",
          emphasis: "secondary",
          layoutHint: "Proof rail with supporting signals.",
        },
      ],
      requiredElements: [
        "hero section",
        "product overview",
        "navigation to key site pages",
      ],
      imageSlots: [],
    },
    {
      key: "about",
      title: "About",
      outputKind: "page",
      pageRole: "about page",
      layoutStrategy:
        "Design a trust-building about page that foregrounds the company story, team credibility, and values instead of a conversion-heavy homepage hero.",
      sectionBlueprint: [
        {
          id: "intro",
          label: "Intro",
          purpose: "Orient the user to the team or company.",
          emphasis: "primary",
          layoutHint: "Tighter intro without homepage-style hero marketing.",
        },
        {
          id: "story",
          label: "Story",
          purpose: "Explain the company narrative.",
          emphasis: "primary",
          layoutHint: "Narrative content band.",
        },
        {
          id: "team",
          label: "Team",
          purpose: "Show team credibility.",
          emphasis: "secondary",
          layoutHint: "Profile grid or founder section.",
        },
      ],
      requiredElements: ["brand story", "team or founder section", "values or principles"],
      imageSlots: [],
    },
  ],
};

describe("planned generation prompt", () => {
  it("builds a prose design brief prompt instead of schema instructions", () => {
    const prompt = composeDesignBriefPrompt({
      userPrompt: "Design two distinct landing page concepts for an AI marketing SaaS.",
      compactHistory: [
        {
          role: "user",
          content: "We want the first concept warm and the second more editorial.",
        },
      ],
      targetPages: [
        { id: "page-1", title: "Home" },
        { id: "page-2", title: "Home Alt" },
      ],
      plan: conceptPlan,
      suggestedPreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
    });

    expect(prompt).toContain("Write one detailed production brief");
    expect(prompt).toContain("Creative Direction:");
    expect(prompt).toContain("Output Directions:");
    expect(prompt).toContain("hero composition");
    expect(prompt).toContain("section progression");
    expect(prompt).toContain("The brief must be detailed enough");
    expect(prompt).not.toContain("structured output schema");
  });

  it("adds concept variant uniqueness constraints for multi-output plans", () => {
    const prompt = composePlannedGenerateSystemPrompt({
      plan: conceptPlan,
      output: conceptPlan.outputs[0],
      outputIndex: 0,
      allOutputs: conceptPlan.outputs,
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
      allowImages: false,
      userPrompt: "Design two distinct landing page concepts for an AI marketing SaaS.",
      designBrief:
        "Creative Direction: Make the first concept warm and conversion-focused while preserving strong hierarchy.",
    });

    expect(prompt).toContain("Variant uniqueness constraints (critical)");
    expect(prompt).toContain("concept variant 1 of 2");
    expect(prompt).toContain("Guided Clarity");
    expect(prompt).toContain("Do not mirror sibling hero composition");
    expect(prompt).toContain("Detailed brief:");
  });

  it("uses an in-place editing prompt for existing pages", () => {
    const prompt = composePageEditSystemPrompt({
      plan: conceptPlan,
      output: conceptPlan.outputs[0],
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
      allowImages: false,
      userPrompt: "Move the CTA higher and tighten the hero copy.",
      designBrief: "Keep the structure warm and conversion focused.",
      currentHtml:
        "<!doctype html><html><head></head><body><main><section>Existing hero</section></main></body></html>",
    });

    expect(prompt).toContain("Revise the current page instead of generating a new concept from scratch.");
    expect(prompt).toContain("Start from the current HTML and apply the user instruction directly.");
    expect(prompt).toContain("Current HTML:");
    expect(prompt).toContain("Existing hero");
  });

  it("adds non-home page constraints for information architecture outputs", () => {
    const prompt = composePlannedGenerateSystemPrompt({
      plan: informationArchitecturePlan,
      output: informationArchitecturePlan.outputs[1],
      outputIndex: 1,
      allOutputs: informationArchitecturePlan.outputs,
      stylePreset: WIRE_STYLE_PRESETS.find((preset) => preset.id === "warm-minimal")!,
      allowImages: false,
      userPrompt: "Design a small website for an AI marketing SaaS.",
      designBrief: "Keep the about page trust-building and team-led.",
    });

    expect(prompt).toContain("Information architecture constraints (critical)");
    expect(prompt).toContain("The page must read unmistakably as a about page");
    expect(prompt).toContain("do not turn it into another landing page or generic homepage hero");
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
