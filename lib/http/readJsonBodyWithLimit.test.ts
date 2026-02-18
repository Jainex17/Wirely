import { afterEach, describe, expect, it } from "bun:test";
import { readJsonBodyWithLimit } from "@/lib/http/readJsonBodyWithLimit";

const previousMaxBytes = process.env.REQUEST_BODY_MAX_BYTES;

afterEach(() => {
  process.env.REQUEST_BODY_MAX_BYTES = previousMaxBytes;
});

describe("readJsonBodyWithLimit", () => {
  it("parses valid JSON under the limit", async () => {
    process.env.REQUEST_BODY_MAX_BYTES = "1024";
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ prompt: "hello" }),
      headers: { "content-type": "application/json" },
    });

    const result = await readJsonBodyWithLimit<{ prompt: string }>(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.prompt).toBe("hello");
    }
  });

  it("returns 413 for oversized payloads", async () => {
    process.env.REQUEST_BODY_MAX_BYTES = "10";
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ prompt: "this payload is too long" }),
      headers: { "content-type": "application/json" },
    });

    const result = await readJsonBodyWithLimit(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });

  it("returns 400 for malformed JSON", async () => {
    process.env.REQUEST_BODY_MAX_BYTES = "1024";
    const request = new Request("http://localhost/test", {
      method: "POST",
      body: "{invalid-json",
      headers: { "content-type": "application/json" },
    });

    const result = await readJsonBodyWithLimit(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });
});

