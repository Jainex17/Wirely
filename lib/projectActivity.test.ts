import { describe, expect, it } from "bun:test";
import { buildActivityFeed } from "@/lib/projectActivity";
import type { ProjectComment } from "@/lib/projectComments";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 12, 0) + minutes * 60_000).toISOString();

const comment = (overrides: Partial<ProjectComment>): ProjectComment => ({
  id: "c1",
  pageId: "home",
  nodeId: null,
  body: "Tighten the hero",
  x: 0,
  y: 0,
  authorUserId: "u1",
  authorName: "Sam",
  authorAvatarUrl: null,
  resolvedAt: null,
  createdAt: at(10),
  ...overrides,
});

describe("buildActivityFeed", () => {
  it("lists page and comment events newest first", () => {
    const feed = buildActivityFeed({
      pages: [{ id: "home", createdAt: at(0), updatedAt: at(0) }],
      edits: [],
      comments: [comment({ resolvedAt: at(20) })],
    });
    expect(feed.map((item) => item.kind)).toEqual(["comment_resolved", "comment_added", "page_added"]);
  });

  it("shows a burst of edits once, at its latest write, and counts the last write", () => {
    const feed = buildActivityFeed({
      pages: [{ id: "home", createdAt: at(0), updatedAt: at(62) }],
      edits: [
        { pageId: "home", at: at(5) },
        { pageId: "home", at: at(6) },
        { pageId: "home", at: at(60) },
      ],
      comments: [],
    });
    expect(feed.filter((item) => item.kind === "page_edited").map((item) => item.at)).toEqual([at(62), at(6)]);
  });

  it("does not call the writes that finish a new page an edit", () => {
    const feed = buildActivityFeed({
      pages: [{ id: "home", createdAt: at(0), updatedAt: new Date(Date.parse(at(0)) + 5_000).toISOString() }],
      edits: [],
      comments: [],
    });
    expect(feed.map((item) => item.kind)).toEqual(["page_added"]);
  });

  it("drops events for pages that are gone", () => {
    const feed = buildActivityFeed({
      pages: [],
      edits: [{ pageId: "gone", at: at(5) }],
      comments: [comment({ pageId: "gone" })],
    });
    expect(feed).toEqual([]);
  });
});
