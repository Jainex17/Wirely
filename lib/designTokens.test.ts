import { describe, expect, it } from "bun:test";
import { applyDesignTokens, parseDesignTokens, parseTokenLines } from "@/lib/designTokens";

describe("parseDesignTokens", () => {
  it("rejects values that could escape the style block", () => {
    for (const value of ["red;}body{display:none", "</style><script>", "a/*", "x\\3c"]) {
      expect(parseDesignTokens({ "--c": value }).ok).toBe(false);
    }
    expect(parseDesignTokens({ color: "red" }).ok).toBe(false);
  });

  it("accepts plain CSS values and reads the editor's line format", () => {
    expect(parseTokenLines("--color-primary: #4f46e5;\n\n--font: 'Inter', sans-serif")).toEqual({
      ok: true,
      tokens: { "--color-primary": "#4f46e5", "--font": "'Inter', sans-serif" },
    });
  });
});

describe("applyDesignTokens", () => {
  const page = "<html><head><title>x</title></head><body>hi</body></html>";

  it("writes one block after <head>, replaces it on the next write, and removes it", () => {
    const once = applyDesignTokens(page, { "--a": "1px" });
    expect(once).toBe(
      "<html><head><style data-wirely-tokens>:root{--a:1px;}</style><title>x</title></head><body>hi</body></html>",
    );
    const twice = applyDesignTokens(once, { "--b": "2px" });
    expect(twice.match(/data-wirely-tokens/g)?.length).toBe(1);
    expect(twice).toContain("--b:2px;");
    expect(applyDesignTokens(twice, {})).toBe(page);
  });

  it("leaves an empty page empty", () => {
    expect(applyDesignTokens("", { "--a": "1px" })).toBe("");
  });
});
