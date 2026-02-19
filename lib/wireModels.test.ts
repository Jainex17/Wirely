import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ENABLED_WIRE_MODELS,
  normalizeEnabledWireModels,
  resolveEnabledWireModels,
} from "@/lib/wireModels";

describe("wireModels settings helpers", () => {
  it("drops unknown models, removes duplicates, and sorts free-first", () => {
    const normalized = normalizeEnabledWireModels([
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-lite",
      "unknown-model",
      "gemini-2.5-flash",
    ]);

    expect(normalized).toEqual([
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
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
});
