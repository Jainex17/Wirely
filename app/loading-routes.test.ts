import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("route loading files", () => {
  it("includes wire editor loading boundary", () => {
    const source = readFileSync("app/wire/[id]/loading.tsx", "utf8");
    expect(source.includes("export default function WireLoading")).toBe(true);
    expect(source.includes("animate-pulse")).toBe(true);
  });

  it("includes profile loading boundary", () => {
    const source = readFileSync("app/profile/loading.tsx", "utf8");
    expect(source.includes("export default function ProfileLoading")).toBe(true);
    expect(source.includes("animate-pulse")).toBe(true);
  });
});
