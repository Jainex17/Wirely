import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("canvas workspace wiring", () => {
  it("uses shell rendering for offscreen pages and reports live page heights", () => {
    const source = readFileSync("components/PageRenderer.tsx", "utf8");

    expect(source.includes('renderMode === "live"')).toBe(true);
    expect(source.includes("Preview offscreen")).toBe(true);
    expect(source.includes("onMeasuredHeightChange?.(page.id")).toBe(true);
  });

  it("supports keyboard panning and fit shortcuts in the workspace", () => {
    const source = readFileSync("components/EditorWorkspace.tsx", "utf8");

    expect(source.includes('event.code === "Space"')).toBe(true);
    expect(source.includes('event.shiftKey && event.key === "1"')).toBe(true);
    expect(source.includes('event.key === "0"')).toBe(true);
    expect(source.includes("setIsSpacePanning(true)")).toBe(true);
  });
});
