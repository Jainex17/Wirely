import { describe, expect, it } from "bun:test";
import { findTabByName, nextTabName, parseTabName, resolvePageTabs } from "@/lib/projectTabs";

describe("resolvePageTabs", () => {
  it("gives a project with no tab rows one implicit tab holding every page", () => {
    expect(
      resolvePageTabs({ projectId: "proj", tabs: [], assignments: [], pageIds: ["a", "b"] }),
    ).toEqual({
      tabs: [{ id: "proj", name: "Untitled" }],
      pageTabIds: { a: "proj", b: "proj" },
    });
  });

  it("orders tabs by sort order then creation, and puts unassigned and dangling pages on the first", () => {
    const state = resolvePageTabs({
      projectId: "proj",
      tabs: [
        { id: "t2", name: "Mobile", sortOrder: 1, createdAt: new Date("2026-01-02") },
        { id: "t1", name: "Web", sortOrder: 0, createdAt: new Date("2026-01-03") },
        { id: "t0", name: "First", sortOrder: 0, createdAt: new Date("2026-01-01") },
      ],
      assignments: [
        { pageId: "a", tabId: "t2" },
        { pageId: "c", tabId: "gone" },
      ],
      pageIds: ["a", "b", "c"],
    });

    expect(state).toEqual({
      tabs: [
        { id: "t0", name: "First" },
        { id: "t1", name: "Web" },
        { id: "t2", name: "Mobile" },
      ],
      pageTabIds: { a: "t2", b: "t0", c: "t0" },
    });
  });
});

describe("tab names", () => {
  it("trims a name and rejects empty or overlong ones", () => {
    expect(parseTabName("  Checkout  ")).toBe("Checkout");
    expect(parseTabName("   ")).toBeNull();
    expect(parseTabName("x".repeat(81))).toBeNull();
    expect(parseTabName(7)).toBeNull();
  });

  it("numbers the next tab past the count, skipping a number already in use", () => {
    expect(nextTabName([])).toBe("Untitled");
    expect(nextTabName(["Fintech app", "Mobile"])).toBe("Untitled");
    expect(nextTabName(["Fintech app", " untitled "])).toBe("Untitled 2");
    expect(nextTabName(["Untitled", "Untitled 2", "Untitled 4"])).toBe("Untitled 3");
  });

  it("finds a tab by name ignoring case and surrounding spaces", () => {
    const tabs = [
      { id: "t1", name: "Tab 1" },
      { id: "t2", name: "Mobile flows" },
    ];
    expect(findTabByName(tabs, " mobile FLOWS ")).toEqual({ id: "t2", name: "Mobile flows" });
    expect(findTabByName(tabs, "Desktop")).toBeNull();
  });
});
