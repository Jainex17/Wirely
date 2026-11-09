import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("route loading files", () => {
  it("includes wire editor loading boundary", () => {
    const source = readFileSync("app/wire/[id]/loading.tsx", "utf8");
    expect(source.includes("export default function WireLoading")).toBe(true);
    // A static skeleton of the editor chrome, so the swap to the real editor
    // does not flash. It carries no pulse, which would repaint the whole screen.
    expect(source.includes("bg-background")).toBe(true);
    expect(source.includes("animate-pulse")).toBe(false);
  });

  it("includes settings loading boundary", () => {
    const source = readFileSync("app/setting/loading.tsx", "utf8");
    expect(source.includes("export default function SettingLoading")).toBe(true);
    // The page and the settings modal share one skeleton, built from the
    // pulsing Skeleton primitive.
    expect(source.includes("<SettingsSkeleton />")).toBe(true);
    expect(readFileSync("app/setting/SettingsSkeleton.tsx", "utf8").includes("<Skeleton")).toBe(true);
    expect(readFileSync("components/ui/skeleton.tsx", "utf8").includes("animate-pulse")).toBe(true);
  });
});
