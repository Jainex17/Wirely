import { describe, expect, it } from "bun:test";
import { createHtmlHistory } from "@/lib/htmlHistory";

describe("createHtmlHistory", () => {
  it("undoes and redoes edits in order", () => {
    const history = createHtmlHistory();
    const pages: Record<string, string> = { a: "v2" };
    const read = (pageId: string) => pages[pageId];
    history.record([{ pageId: "a", before: "v1", after: "v2" }]);

    expect(history.step("undo", read)).toEqual([{ pageId: "a", html: "v1" }]);
    pages.a = "v1";
    expect(history.step("undo", read)).toBeNull();
    expect(history.step("redo", read)).toEqual([{ pageId: "a", html: "v2" }]);
  });

  it("undoes an edit across two pages as one step", () => {
    const history = createHtmlHistory();
    const pages: Record<string, string> = { a: "a2", b: "b2" };
    history.record([
      { pageId: "a", before: "a1", after: "a2" },
      { pageId: "b", before: "b1", after: "b2" },
    ]);

    expect(history.step("undo", (pageId) => pages[pageId])).toEqual([
      { pageId: "a", html: "a1" },
      { pageId: "b", html: "b1" },
    ]);
  });

  it("clears itself when either page of a two page edit changed since", () => {
    const history = createHtmlHistory();
    const pages: Record<string, string> = { a: "a2", b: "agent rewrite" };
    history.record([
      { pageId: "a", before: "a1", after: "a2" },
      { pageId: "b", before: "b1", after: "b2" },
    ]);

    expect(history.step("undo", (pageId) => pages[pageId])).toBe("stale");
    expect(history.step("redo", (pageId) => pages[pageId])).toBeNull();
  });

  it("clears itself instead of writing over a page that changed since", () => {
    const history = createHtmlHistory();
    history.record([{ pageId: "a", before: "v1", after: "v2" }]);
    history.record([{ pageId: "a", before: "v2", after: "v3" }]);

    expect(history.step("undo", () => "agent rewrite")).toBe("stale");
    expect(history.step("undo", () => "v2")).toBeNull();
  });

  it("drops the redo stack on a new edit", () => {
    const history = createHtmlHistory();
    history.record([{ pageId: "a", before: "v1", after: "v2" }]);
    history.step("undo", () => "v2");
    history.record([{ pageId: "a", before: "v1", after: "v3" }]);
    expect(history.step("redo", () => "v3")).toBeNull();
  });
});
