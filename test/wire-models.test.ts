import { describe, expect, it } from "bun:test";
import {
  fromCustomLocalModelId,
  getWireModelProvider,
  isCustomLocalModelId,
  isOpencodeWireModel,
  isWireModelName,
  normalizeCustomLocalModels,
  resolveRunnableWireModel,
  MAX_CUSTOM_LOCAL_MODELS,
  toCustomLocalModelId,
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
      "gemini-3.8-flash",
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
      "google/gemini-3.1-pro-preview",
      "gemini-3.8-flash",
    ];
    const resolved = resolveRunnableWireModel(enabled, ALL_PRESENCE);

    expect(resolved).toBe("gemini-3.8-flash");
  });

  it("falls back to the first enabled model when no provider has a key", () => {
    const resolved = resolveRunnableWireModel(
      ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
      NONE_PRESENCE,
    );

    expect(resolved).toBe("gemini-3.8-flash");
  });

  it("returns null when nothing is enabled", () => {
    expect(resolveRunnableWireModel([], PRESENCE)).toBeNull();
  });
});

describe("custom local models", () => {
  const CUSTOM_ID = "local/zai-coding-plan/glm-4.6";

  it("treats a prefixed provider/model as a wire model routed to the agent", () => {
    expect(isWireModelName(CUSTOM_ID)).toBe(true);
    expect(getWireModelProvider(CUSTOM_ID)).toBe("local");
    expect(isOpencodeWireModel(CUSTOM_ID)).toBe(true);
  });

  it("rejects malformed custom ids", () => {
    expect(isWireModelName("local/nope")).toBe(false);
    expect(isWireModelName("local//")).toBe(false);
    expect(isWireModelName("locally/gemini")).toBe(false);
    expect(isCustomLocalModelId("local/ok-model/name")).toBe(true);
  });

  it("round-trips between the wire id and the raw opencode string", () => {
    expect(toCustomLocalModelId("zai-coding-plan/glm-4.6")).toBe(CUSTOM_ID);
    expect(fromCustomLocalModelId(CUSTOM_ID)).toBe("zai-coding-plan/glm-4.6");
    expect(fromCustomLocalModelId("gemini-3.8-flash")).toBeNull();
  });

  it("keeps the stored list valid, unique and bounded", () => {
    const normalized = normalizeCustomLocalModels([
      "zai-coding-plan/glm-4.6",
      "zai-coding-plan/glm-4.6",
      " github-copilot/claude-opus-5 ",
      "not-a-model",
      "",
      42,
      null,
    ]);

    expect(normalized).toEqual([
      "zai-coding-plan/glm-4.6",
      "github-copilot/claude-opus-5",
    ]);
  });

  it("caps the list so one settings call cannot flood the picker", () => {
    const flood = Array.from(
      { length: MAX_CUSTOM_LOCAL_MODELS + 5 },
      (_, index) => `provider/model-${index}`,
    );
    expect(normalizeCustomLocalModels(flood)).toHaveLength(MAX_CUSTOM_LOCAL_MODELS);
  });
});
