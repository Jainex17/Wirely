import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("wire route streaming invariants", () => {
  const source = read("app/api/wire/[id]/route.ts");

  it("keeps authentication and validation before the data stream starts", () => {
    const authIndex = source.indexOf("getRequestSessionUser");
    const rateLimitIndex = source.indexOf("wireRateLimiter.check");
    const streamIndex = source.indexOf("createDataStreamResponse({");

    expect(authIndex).toBeGreaterThan(-1);
    expect(rateLimitIndex).toBeGreaterThan(authIndex);
    expect(streamIndex).toBeGreaterThan(rateLimitIndex);
  });

  it("merges rate-limit headers into the stream response", () => {
    const streamSection = source.slice(source.indexOf("createDataStreamResponse({"));
    expect(streamSection.includes("...rateLimitResult.headers")).toBe(true);
    expect(streamSection.includes('"cache-control": "no-store, no-transform"')).toBe(
      true,
    );
  });

  it("reports fatal failures in-band via thrown errors instead of clean terminators", () => {
    expect(source.includes("class WireQualityBarError extends Error {}")).toBe(true);
    expect(source.includes("throw new WireQualityBarError(failureMessage)")).toBe(
      true,
    );
    expect(source.includes("selectedModelFailureResponse")).toBe(false);
    expect(source.includes("insufficientFundsResponse")).toBe(false);
  });

  it("emits planning summary and progress as stream data events", () => {
    expect(source.includes('type: "planning-summary"')).toBe(true);
    expect(source.includes('type: "page-status"')).toBe(true);
    expect(source.includes('type: "suggestions"')).toBe(true);
    expect(source.includes("x-wire-planning-summary")).toBe(false);
  });

  it("writes the final assistant content with the unchanged data-stream terminators", () => {
    expect(source.includes("writeAssistantStreamFinish(dataStream, assistantContent)")).toBe(
      true,
    );
    expect(source.includes("buildAssistantContent({")).toBe(true);
  });
});
