import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("HomeClient unauthenticated submit guard", () => {
  it("redirects guests to login before generation call", () => {
    const source = readFileSync("app/HomeClient.tsx", "utf8");

    expect(source.includes('toast.error("Sign in to generate designs.")')).toBe(true);
    expect(source.includes('router.push("/login?next=/")')).toBe(true);
  });

  it("leaves the generation mode and output count to the planner", () => {
    const source = readFileSync("app/HomeClient.tsx", "utf8");

    // The composer used to carry a mode picker and an output-count picker. The
    // planner decides both now, so the client must not pin either one.
    expect(source.includes("wireGenerationMode")).toBe(false);
    expect(source.includes("wirePageCount")).toBe(false);
    expect(source.includes("modeOverride")).toBe(false);
    expect(source.includes("Decide for me")).toBe(false);
  });
});
