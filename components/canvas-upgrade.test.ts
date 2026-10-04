import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("canvas workspace wiring", () => {
  it("renders one page live and reports page heights", () => {
    const source = readFileSync("components/PageRenderer.tsx", "utf8");

    expect(source.includes('renderMode === "live"')).toBe(true);
    expect(source.includes("hasHtml && isLive && measuredSrcDoc ? (")).toBe(true);
    expect(source.includes("onMeasuredHeightChange?.(page.id")).toBe(true);
  });

  it("supports keyboard panning and fit shortcuts in the workspace", () => {
    const source = readFileSync("components/EditorWorkspace.tsx", "utf8");

    expect(source.includes('event.code === "Space"')).toBe(true);
    expect(source.includes("Digit1: fitAllPages")).toBe(true);
    expect(source.includes("Digit0: () => setZoom(100)")).toBe(true);
    expect(source.includes("setIsSpacePanning(true)")).toBe(true);
  });
});
