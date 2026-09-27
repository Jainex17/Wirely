import { describe, expect, it } from "bun:test";
import { MAX_COMMENT_CHARS, parseCommentInput } from "@/lib/projectComments";

const pageId = "0b6f5a4e-2c1d-4e7a-9f3b-5d8c7a6b4e21";

describe("parseCommentInput", () => {
  it("trims the body and rounds the pin to whole pixels", () => {
    expect(parseCommentInput({ pageId, body: "  Bigger CTA  ", x: 10.4, y: 99.6 })).toEqual({
      ok: true,
      input: { pageId, body: "Bigger CTA", x: 10, y: 100 },
    });
  });

  it("rejects empty or oversized bodies, bad ids, and pins off the page", () => {
    const valid = { pageId, body: "ok", x: 1, y: 1 };
    expect(parseCommentInput({ ...valid, body: "   " }).ok).toBe(false);
    expect(parseCommentInput({ ...valid, body: "a".repeat(MAX_COMMENT_CHARS + 1) }).ok).toBe(false);
    expect(parseCommentInput({ ...valid, pageId: "page-home" }).ok).toBe(false);
    expect(parseCommentInput({ ...valid, x: -1 }).ok).toBe(false);
    expect(parseCommentInput({ ...valid, y: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(parseCommentInput(null).ok).toBe(false);
  });
});
