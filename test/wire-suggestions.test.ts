import { describe, expect, test } from "bun:test";
import { buildWireSuggestions } from "@/lib/wireSuggestions";

describe("buildWireSuggestions", () => {
  test("returns three chips for a single-page desktop generation", () => {
    const chips = buildWireSuggestions({
      generationMode: "single_page",
      deviceIntent: "desktop",
      prompt: "Build a landing page for a coffee subscription",
    });

    expect(chips).toHaveLength(3);
    expect(new Set(chips).size).toBe(3);
  });

  test("returns mobile-first chips when the device intent is mobile", () => {
    const chips = buildWireSuggestions({
      generationMode: "single_page",
      deviceIntent: "mobile",
      prompt: "Build a mobile dashboard",
    });

    expect(chips).toContain("Make navigation thumb-friendly");
  });

  test("returns concept chips for concept_variants mode", () => {
    const chips = buildWireSuggestions({
      generationMode: "concept_variants",
      deviceIntent: "desktop",
      prompt: "Design three concepts for a fitness app",
    });

    expect(chips).toContain("Create a darker variant of this concept");
  });

  test("returns IA chips for information_architecture mode", () => {
    const chips = buildWireSuggestions({
      generationMode: "information_architecture",
      deviceIntent: "desktop",
      prompt: "Build a multi-page marketing site",
    });

    expect(chips).toContain("Add a contact page");
  });

  test("dedupes chips", () => {
    const chips = buildWireSuggestions({
      generationMode: "information_architecture",
      deviceIntent: "mobile",
      prompt: "Mobile app site",
    });

    expect(new Set(chips).size).toBe(chips.length);
  });

  test("handles a missing generation mode", () => {
    const chips = buildWireSuggestions({
      generationMode: null,
      deviceIntent: "desktop",
      prompt: "A crypto tracker",
    });

    expect(chips).toHaveLength(3);
  });
});
