import { describe, expect, it } from "bun:test";
import {
  resolveRunnableWireModel,
  type WireModelName,
} from "@/lib/wireModels";

const PRESENCE = {
  google: true,
  openrouter: false,
  zai: false,
};

const ALL_PRESENCE = {
  google: true,
  openrouter: true,
  zai: true,
};

const NONE_PRESENCE = {
  google: false,
  openrouter: false,
  zai: false,
};

describe("resolveRunnableWireModel", () => {
  it("skips enabled models whose provider has no key", () => {
    const enabled: WireModelName[] = [
      "gemini-2.5-flash",
      "z-ai/glm-5.2:free",
    ];
    const resolved = resolveRunnableWireModel(enabled, {
      google: false,
      openrouter: true,
      zai: false,
    });

    expect(resolved).toBe("z-ai/glm-5.2:free");
  });

  it("prefers free tiers when several providers have keys", () => {
    const enabled: WireModelName[] = [
      "google/gemini-2.5-pro",
      "gemini-2.5-flash",
    ];
    const resolved = resolveRunnableWireModel(enabled, ALL_PRESENCE);

    expect(resolved).toBe("gemini-2.5-flash");
  });

  it("falls back to the first enabled model when no provider has a key", () => {
    const resolved = resolveRunnableWireModel(
      ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
      NONE_PRESENCE,
    );

    expect(resolved).toBe("gemini-2.5-flash");
  });

  it("returns null when nothing is enabled", () => {
    expect(resolveRunnableWireModel([], PRESENCE)).toBeNull();
  });
});
