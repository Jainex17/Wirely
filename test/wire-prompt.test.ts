import { describe, expect, it } from "bun:test";
import {
  composeGenerateSystemPrompt,
  getWireStylePresetById,
  selectWireStylePreset,
  WIRE_STYLE_PRESETS,
} from "@/lib/wirePrompt";

describe("wirePrompt helpers", () => {
  it("resolves style presets by id", () => {
    expect(getWireStylePresetById("premium-dark")?.name).toBe("Premium Dark");
    expect(getWireStylePresetById("unknown-preset")).toBeUndefined();
    expect(getWireStylePresetById(null)).toBeUndefined();
  });

  it("picks an explicit preset when prompt intent is clear", () => {
    const preset = selectWireStylePreset({
      wireId: "wire-1",
      userPrompt: "Need a premium luxury website for an exclusive brand",
    });
    expect(preset.id).toBe("premium-dark");
  });

  it("falls back to deterministic hash-based preset selection", () => {
    const first = selectWireStylePreset({
      wireId: "stable-wire",
      userPrompt: "Build a homepage",
    });
    const second = selectWireStylePreset({
      wireId: "stable-wire",
      userPrompt: "Build a homepage",
    });

    expect(first.id).toBe(second.id);
    expect(WIRE_STYLE_PRESETS.some((preset) => preset.id === first.id)).toBe(true);
  });

  it("composes generation prompt with image restrictions and dashboard constraints", () => {
    const prompt = composeGenerateSystemPrompt({
      stylePreset: WIRE_STYLE_PRESETS[0],
      allowImages: false,
      userPrompt: "Build an analytics dashboard with active and foundational tabs",
    });

    expect(prompt.includes("DETAILS:")).toBe(true);
    expect(prompt.includes("HTML:")).toBe(true);
    expect(prompt.includes("Do not use external bitmap image assets")).toBe(true);
    expect(prompt.includes("The requested artifact is a dashboard/application UI")).toBe(
      true,
    );
    expect(prompt.includes("include KPI cards plus at least 2 real chart renders")).toBe(
      true,
    );
  });

  it("composes generation prompt with allowed-images rule", () => {
    const prompt = composeGenerateSystemPrompt({
      stylePreset: WIRE_STYLE_PRESETS[1],
      allowImages: true,
      userPrompt: "Design a marketing landing page",
    });

    expect(
      prompt.includes(
        "Images are allowed because the user explicitly requested them",
      ),
    ).toBe(true);
  });

  it("keeps landing guardrails when tool names include the word dashboard", () => {
    const prompt = composeGenerateSystemPrompt({
      stylePreset: WIRE_STYLE_PRESETS[1],
      allowImages: false,
      userPrompt:
        "Design a landing page for SERanking and list tools including SEO Dashboard and AI Overviews Tracker.",
    });

    expect(prompt.includes("Intent alignment (landing mode):")).toBe(true);
    expect(
      prompt.includes("The requested artifact is a dashboard/application UI"),
    ).toBe(false);
  });
});
