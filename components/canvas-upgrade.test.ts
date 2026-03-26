import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("canvas workspace upgrade wiring", () => {
  it("adds a minimap and fit/focus actions to the canvas shell", () => {
    const canvasSource = readFileSync("components/Canvas.tsx", "utf8");
    const toolbarSource = readFileSync("components/CanvasToolbar.tsx", "utf8");

    expect(canvasSource.includes("<CanvasMinimap")).toBe(true);
    expect(toolbarSource.includes("Focus")).toBe(true);
    expect(toolbarSource.includes("Fit All")).toBe(true);
  });

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
