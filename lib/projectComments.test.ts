import { describe, expect, it } from "bun:test";
import {
  formatCommentsForAgent,
  MAX_COMMENT_CHARS,
  parseCommentInput,
} from "@/lib/projectComments";

const pageId = "0b6f5a4e-2c1d-4e7a-9f3b-5d8c7a6b4e21";

describe("parseCommentInput", () => {
  it("trims the body and rounds the pin to whole pixels", () => {
    expect(parseCommentInput({ pageId, body: "  Bigger CTA  ", x: 10.4, y: 99.6 })).toEqual({
      ok: true,
      input: { pageId, nodeId: null, body: "Bigger CTA", x: 10, y: 100 },
    });
  });

  it("keeps a picked element's id and rejects one that is not a node id", () => {
    const valid = { pageId, body: "ok", x: 1, y: 1 };
    expect(parseCommentInput({ ...valid, nodeId: "k3f9a2" })).toMatchObject({
      ok: true,
      input: { nodeId: "k3f9a2" },
    });
    expect(parseCommentInput({ ...valid, nodeId: '"><script>' }).ok).toBe(false);
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

describe("formatCommentsForAgent", () => {
  const comment = (id: string, page: string, resolvedAt: string | null) => ({
    id,
    pageId: page,
    nodeId: id === "open-home" ? "k3f9a2" : null,
    pageTitle: page === pageId ? "Home" : "Pricing",
    deviceType: "desktop",
    body: `Comment ${id}`,
    x: 120,
    y: 480,
    authorUserId: "user-1",
    authorName: "Priya Raman",
    authorAvatarUrl: "https://img.example/priya.png",
    resolvedAt,
    createdAt: "2026-09-20T10:00:00.000Z",
  });
  const comments = [
    comment("open-home", pageId, null),
    comment("done-home", pageId, "2026-09-21T10:00:00.000Z"),
    comment("open-pricing", "other-page", null),
  ];

  it("returns open comments only unless resolved ones are asked for", () => {
    expect(formatCommentsForAgent(comments, {}).map((c) => c.id)).toEqual([
      "open-home",
      "open-pricing",
    ]);
    expect(formatCommentsForAgent(comments, { includeResolved: true })).toHaveLength(3);
  });

  it("narrows to one page", () => {
    expect(formatCommentsForAgent(comments, { pageId }).map((c) => c.id)).toEqual(["open-home"]);
  });

  it("gives the agent the page and pin but not the author's account details", () => {
    const [first] = formatCommentsForAgent(comments, {});
    expect(first).toEqual({
      id: "open-home",
      pageId,
      pageTitle: "Home",
      deviceType: "desktop",
      nodeId: "k3f9a2",
      author: "Priya Raman",
      body: "Comment open-home",
      pin: { x: 120, y: 480 },
      resolved: false,
      createdAt: "2026-09-20T10:00:00.000Z",
    });
  });
});
