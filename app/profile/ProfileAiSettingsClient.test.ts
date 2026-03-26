import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("Profile settings storage safety", () => {
  it("does not persist API keys to browser storage APIs", () => {
    const source = [
      "app/profile/ProfileApiKeyDialog.tsx",
      "app/profile/ProfileProvidersClient.tsx",
      "app/profile/useProfileAiSettings.ts",
    ]
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    expect(source.includes("localStorage")).toBe(false);
    expect(source.includes("sessionStorage")).toBe(false);
  });
});
