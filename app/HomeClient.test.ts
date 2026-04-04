import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("HomeClient unauthenticated submit guard", () => {
  it("redirects guests to login before generation call", () => {
    const source = readFileSync("app/HomeClient.tsx", "utf8");

    expect(source.includes('toast.error("Sign in to generate designs.")')).toBe(true);
    expect(source.includes('router.push("/login?next=/")')).toBe(true);
  });

  it("surfaces explicit generation modes instead of a single ambiguous variations control", () => {
    const source = readFileSync("app/HomeClient.tsx", "utf8");

    expect(source.includes("Single page")).toBe(true);
    expect(source.includes("Concepts")).toBe(true);
    expect(source.includes("Website pages")).toBe(true);
    expect(source.includes("wireGenerationMode")).toBe(true);
  });
});
