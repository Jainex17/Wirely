import { describe, expect, it } from "bun:test";
import {
  filterMentionPages,
  findMentionQuery,
  hasNewScreenIntent,
  inferPromptTarget,
  pruneMentions,
} from "@/lib/wirePromptTarget";

const pages = [
  { id: "p1", title: "Home" },
  { id: "p2", title: "Pricing" },
  { id: "p3", title: "Checkout" },
  { id: "p4", title: "Settings" },
];

const infer = (prompt: string, mentionedPageIds: string[] = [], focusedPageId: string | null = null) =>
  inferPromptTarget({ prompt, mentionedPageIds, pages, focusedPageId });

describe("inferPromptTarget", () => {
  it("edits the one mentioned page, even when the text asks for a new page", () => {
    expect(infer("@Pricing add a new page style header", ["p2"], "p1")).toEqual({
      kind: "page",
      pageId: "p2",
    });
  });

  it("targets each mentioned page, deduped, and ignores ids no longer on the canvas", () => {
    expect(infer("@Home and @Checkout get a dark theme", ["p1", "p3", "p1", "gone"])).toEqual({
      kind: "pages",
      pageIds: ["p1", "p3"],
      droppedCount: 0,
    });
  });

  it("creates a page for a clear new-screen request", () => {
    expect(infer("add a pricing page", [], "p1")).toEqual({ kind: "new" });
  });

  it("targets all pages, capped at three, when the prompt says so", () => {
    expect(infer("use a serif font on every page", [], "p1")).toEqual({
      kind: "pages",
      pageIds: ["p1", "p2", "p3"],
      droppedCount: 1,
    });
  });

  it("falls back to the focused page, then the first page", () => {
    expect(infer("make the hero darker", [], "p3")).toEqual({ kind: "page", pageId: "p3" });
    expect(infer("make the hero darker", [], "missing")).toEqual({ kind: "page", pageId: "p1" });
    expect(
      inferPromptTarget({ prompt: "hi", mentionedPageIds: [], pages: [], focusedPageId: null }),
    ).toEqual({ kind: "none" });
  });
});

describe("hasNewScreenIntent", () => {
  it.each([
    "add a pricing page",
    "Add another page with a FAQ",
    "create a signup screen",
    "new page for account settings",
    "another screen showing the checkout",
    "Design a new onboarding screen.",
    "build an admin dashboard page and link it",
  ])("reads %p as a new screen", (prompt) => {
    expect(hasNewScreenIntent(prompt)).toBe(true);
  });

  it.each([
    "add a button to the hero",
    "add a CTA to the pricing page",
    "add page numbers to the footer",
    "add a page title",
    "make the new page darker",
    "make this page darker",
    "copy the header to another page",
    "add a new section to the page",
  ])("reads %p as an edit", (prompt) => {
    expect(hasNewScreenIntent(prompt)).toBe(false);
  });
});

describe("mentions", () => {
  it("drops a mention when its text is deleted and keeps duplicates by count", () => {
    const mentions = [
      { pageId: "a", label: "@Home" },
      { pageId: "b", label: "@Home" },
      { pageId: "c", label: "@Pricing" },
    ];

    expect(pruneMentions("fix @Home spacing", mentions)).toEqual([{ pageId: "a", label: "@Home" }]);
    expect(pruneMentions("@Home vs @Home and @Pricing", mentions)).toEqual(mentions);
  });

  it("finds the query being typed after an @ and ignores email addresses", () => {
    expect(findMentionQuery("tweak @Pri", 10)).toEqual({ start: 6, query: "Pri" });
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(findMentionQuery("mail me@site.com", 16)).toBeNull();
    expect(findMentionQuery("@Home\nnext line", 15)).toBeNull();
  });

  it("stays closed right after a mention is picked, and reopens once it is deleted", () => {
    expect(findMentionQuery("Make @Clack hero ", 17, ["@Clack hero"])).toBeNull();
    expect(findMentionQuery("Make @Cl", 8, [])).toEqual({ start: 5, query: "Cl" });
  });

  it("filters pages by title, case insensitively", () => {
    expect(filterMentionPages(pages, "ing").map((page) => page.id)).toEqual(["p2", "p4"]);
  });
});
