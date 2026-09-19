import { describe, expect, it } from "bun:test";
import { inferGenerationMode } from "./inferGenerationMode";

describe("inferGenerationMode", () => {
  it("defaults to a single page", () => {
    expect(inferGenerationMode("A booking page for a barbershop")).toBe("single_page");
    expect(inferGenerationMode("")).toBe("single_page");
  });

  it("reads a request for several directions as concepts", () => {
    expect(inferGenerationMode("Give me 3 concepts for a pricing page")).toBe(
      "concept_variants",
    );
    expect(inferGenerationMode("two different directions for the hero")).toBe(
      "concept_variants",
    );
  });

  it("reads a named page list or a whole site as information architecture", () => {
    expect(inferGenerationMode("A multi-page site for a design studio")).toBe(
      "information_architecture",
    );
    expect(inferGenerationMode("Home, About and Contact for a bakery")).toBe(
      "information_architecture",
    );
  });

  it("prefers the site reading when a prompt asks for both", () => {
    expect(
      inferGenerationMode("Home, About and Pricing in two different styles"),
    ).toBe("information_architecture");
  });
});
