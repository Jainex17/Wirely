import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ENABLED_WIRE_MODELS,
  normalizeEnabledWireModels,
  resolveFastWireModelForStage,
  resolveEnabledWireModels,
} from "@/lib/wireModels";

describe("wireModels settings helpers", () => {
  it("drops unknown models, removes duplicates, and sorts free-first", () => {
    const normalized = normalizeEnabledWireModels([
      "minimax-m2.5-free",
      "gemini-3.1-pro-preview",
      "glm-4.5-flash",
      "gemini-3.5-flash-lite",
      "glm-4.7-flash",
      "gemini-3.5-flash-lite",
      "gpt-5-nano",
      "trinity-large-preview-free",
      "unknown-model",
      "gemini-3.8-flash",
    ]);

    expect(normalized).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
      "glm-4.7-flash",
      "glm-4.5-flash",
    ]);
  });

  it("uses default enabled models when persisted value is null or invalid", () => {
    expect(resolveEnabledWireModels(null)).toEqual([...DEFAULT_ENABLED_WIRE_MODELS]);
    expect(resolveEnabledWireModels(undefined)).toEqual([
      ...DEFAULT_ENABLED_WIRE_MODELS,
    ]);
    expect(resolveEnabledWireModels({ invalid: true })).toEqual([
      ...DEFAULT_ENABLED_WIRE_MODELS,
    ]);
  });

  it("preserves explicit empty array when all models are disabled", () => {
    expect(resolveEnabledWireModels([])).toEqual([]);
  });

  it("chooses the fastest model in the same provider family for planner and critic stages", () => {
    expect(resolveFastWireModelForStage("gemini-3.1-pro-preview")).toBe(
      "gemini-3.5-flash-lite",
    );
    expect(resolveFastWireModelForStage("google/gemini-3.1-pro-preview")).toBe(
      "google/gemini-3.5-flash-lite",
    );
    expect(resolveFastWireModelForStage("glm-4.5-flash")).toBe("glm-4.7-flash");
  });
});
