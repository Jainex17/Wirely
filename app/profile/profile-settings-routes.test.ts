import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

describe("profile settings routes", () => {
  it("uses a shared profile layout with settings navigation", () => {
    const source = readFileSync("app/setting/layout.tsx", "utf8");

    expect(source.includes("ProfileSettingsNav")).toBe(true);
    expect(source.includes("Manage your account preferences and configuration.")).toBe(true);
  });

  it("exposes dedicated providers and models pages", () => {
    const providersSource = readFileSync("app/setting/provider/page.tsx", "utf8");
    const modelsSource = readFileSync("app/setting/model/page.tsx", "utf8");

    expect(providersSource.includes("ProfileProvidersClient")).toBe(true);
    expect(modelsSource.includes("ProfileModelsClient")).toBe(true);
  });

  it("renders loading fallbacks without duplicating layout chrome", () => {
    for (const path of ["app/setting/loading.tsx", "app/profile/loading.tsx"]) {
      const source = readFileSync(path, "utf8");

      expect(source.includes("<main")).toBe(false);
      expect(source.includes("Signed in as")).toBe(false);
      expect(source.includes("ProfileSettingsNav")).toBe(false);
      expect(source.includes('href="/"')).toBe(false);
    }
  });
});
