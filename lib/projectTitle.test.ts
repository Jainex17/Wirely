import { describe, expect, it } from "bun:test";
import { parseProjectTitle } from "@/lib/projectTitle";

describe("parseProjectTitle", () => {
  it("trims and collapses whitespace", () => {
    expect(parseProjectTitle("  Checkout \n  redesign ")).toBe("Checkout redesign");
  });

  it("rejects an empty, overlong, or non-string title", () => {
    expect(parseProjectTitle("   ")).toBe(null);
    expect(parseProjectTitle("x".repeat(121))).toBe(null);
    expect(parseProjectTitle(42)).toBe(null);
  });

  it("keeps a title at the limit", () => {
    expect(parseProjectTitle("x".repeat(120))).toBe("x".repeat(120));
  });
});
