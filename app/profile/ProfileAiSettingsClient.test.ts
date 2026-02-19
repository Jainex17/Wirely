import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("ProfileAiSettingsClient storage safety", () => {
  it("does not persist API keys to browser storage APIs", () => {
    const source = readFileSync(
      "app/profile/ProfileAiSettingsClient.tsx",
      "utf8",
    );

    expect(source.includes("localStorage")).toBe(false);
    expect(source.includes("sessionStorage")).toBe(false);
  });
});
