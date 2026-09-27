import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("route loading files", () => {
  it("includes wire editor loading boundary", () => {
    const source = readFileSync("app/wire/[id]/loading.tsx", "utf8");
    expect(source.includes("export default function WireLoading")).toBe(true);
    // A static skeleton of the editor chrome, so the swap to the real editor
    // does not flash. It carries no pulse, which would repaint the whole screen.
    expect(source.includes("editor-theme")).toBe(true);
  });

  it("includes settings loading boundary", () => {
    const source = readFileSync("app/setting/loading.tsx", "utf8");
    expect(source.includes("export default function SettingLoading")).toBe(true);
    expect(source.includes("animate-pulse")).toBe(true);
  });
});
