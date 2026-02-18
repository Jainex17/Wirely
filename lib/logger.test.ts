import { describe, expect, it } from "bun:test";
import { sanitizeForLog } from "@/lib/logger";

describe("sanitizeForLog", () => {
  it("redacts sensitive keys", () => {
    const sanitized = sanitizeForLog({
      authorization: "Bearer x",
      cookie: "foo=bar",
      prompt: "secret prompt",
      nested: {
        apiKey: "abc",
        html: "<html></html>",
      },
      safeField: "visible",
    }) as Record<string, unknown>;

    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized.prompt).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).html).toBe("[REDACTED]");
    expect(sanitized.safeField).toBe("visible");
  });

  it("serializes errors safely", () => {
    const sanitized = sanitizeForLog(new Error("boom")) as Record<string, unknown>;
    expect(sanitized.name).toBe("Error");
    expect(sanitized.message).toBe("boom");
  });
});

