import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDefaultCamera } from "@/lib/canvasScene";
import { getViewportSceneBounds, useEditorStore } from "@/store/useEditorStore";

const resetStore = () => {
  useEditorStore.setState({
    ...useEditorStore.getInitialState(),
    ...{
      pages: [
        { id: "page-1", title: "Page 1", sections: [] },
        { id: "page-2", title: "Page 2", sections: [] },
      ],
      pageStackOrder: ["page-1", "page-2"],
      focusedPageId: "page-1",
      viewportSize: { width: 1400, height: 900 },
    },
  });
};

beforeEach(() => {
  useEditorStore.persist.clearStorage();
  resetStore();
});

afterEach(() => {
  useEditorStore.persist.clearStorage();
  resetStore();
});

describe("useEditorStore canvas state", () => {
  it("hydrates legacy layout objects without camera state", () => {
    useEditorStore.getState().hydratePageLayout({
      pagePositions: {
        "page-1": { x: 80, y: 20 },
      },
      pageStackOrder: ["page-2", "page-1"],
    });

    const state = useEditorStore.getState();
    expect(state.pagePositions["page-1"]).toEqual({ x: 80, y: 20 });
    expect(state.pageStackOrder).toEqual(["page-2", "page-1"]);
    expect(state.camera).toEqual(createDefaultCamera());
  });

  it("drops a stacked saved position on load but keeps a shared column", () => {
    useEditorStore.setState({
      pages: ["page-1", "page-2", "page-3"].map((id) => ({ id, title: id, sections: [] })),
    });
    useEditorStore.getState().hydratePageLayout({
      pagePositions: {
        "page-1": { x: -720, y: 0 },
        "page-2": { x: -720, y: 0 },
        "page-3": { x: -720, y: 1200 },
      },
    });

    expect(useEditorStore.getState().pagePositions).toEqual({
      "page-1": { x: -720, y: 0 },
      "page-3": { x: -720, y: 1200 },
    });
  });

  it("restores saved frame heights for current pages, but not over a fresh measurement", () => {
    useEditorStore.setState({
      pages: ["page-1", "page-2"].map((id) => ({ id, title: id, sections: [] })),
      pageFrameHeights: { "page-2": 1800 },
    });
    useEditorStore.getState().hydratePageLayout({
      pageFrameHeights: { "page-1": 4200, "page-2": 900, gone: 3000, "page-3": Number.NaN },
    });

    expect(useEditorStore.getState().pageFrameHeights).toEqual({ "page-1": 4200, "page-2": 1800 });
  });

  it("updates frame heights and focuses a page using the current zoom", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: 0, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 2200, y: 0 });
    useEditorStore.getState().setPageFrameHeight("page-2", 1400);
    useEditorStore.getState().setCamera({ x: 0, y: 0, zoom: 64 });

    useEditorStore.getState().focusPage("page-2");

    const state = useEditorStore.getState();
    expect(state.focusedPageId).toBe("page-2");
    expect(state.pageFrameHeights["page-2"]).toBe(1400);
    expect(state.camera.zoom).toBe(64);
    expect(state.camera.x).toBeLessThan(0);
  });

  it("fits all pages into the viewport", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1000, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 1400, y: 0 });

    useEditorStore.getState().fitAllPages();

    expect(useEditorStore.getState().camera.zoom).toBeLessThan(64);
  });

  it("fits the top screen of a very tall page instead of its full height", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1000, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 1400, y: 0 });
    useEditorStore.getState().fitAllPages();
    const shortPagesZoom = useEditorStore.getState().camera.zoom;

    useEditorStore.getState().setPageFrameHeight("page-1", 12000);
    useEditorStore.getState().fitAllPages();

    expect(useEditorStore.getState().camera.zoom).toBe(shortPagesZoom);
  });

  it("tidies dragged pages back into one row", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: 500, y: 900 });
    useEditorStore.getState().setPagePosition("page-2", { x: -800, y: -300 });

    useEditorStore.getState().arrangePages("row");

    const { pagePositions } = useEditorStore.getState();
    expect(pagePositions["page-2"]).toEqual({ x: -800, y: 0 });
    expect(pagePositions["page-1"].y).toBe(0);
    expect(pagePositions["page-1"].x).toBeGreaterThan(-800);
  });

  it("starts a new design on a new row under every page", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1560, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 0, y: 0 });
    useEditorStore.getState().setPageFrameHeight("page-2", 2000);

    const createdPageId = useEditorStore.getState().createPage("Page 3");

    expect(useEditorStore.getState().pagePositions[createdPageId]).toEqual({ x: -1560, y: 2120 });
  });

  it("puts another page of the same design right of it in the same row", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1560, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 0, y: 1200 });

    const createdPageId = useEditorStore.getState().createPage("Pricing", "page-2");
    const state = useEditorStore.getState();

    expect(state.pagePositions[createdPageId]).toEqual({ x: 1560, y: 1200 });
    expect(state.pages.map((page) => page.id)).toEqual(["page-1", "page-2", createdPageId]);
  });

  it("focuses a generated batch as a group", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1000, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 1400, y: 0 });
    useEditorStore.getState().setCamera({ x: 0, y: 0, zoom: 100 });

    useEditorStore.getState().focusPages(["page-1", "page-2"]);

    const state = useEditorStore.getState();
    expect(state.focusedPageId).toBe("page-2");
    expect(state.camera.zoom).toBeLessThan(100);
  });
});

describe("useEditorStore generation status and device state", () => {
  it("sets, updates, and clears page statuses", () => {
    useEditorStore.getState().setPageStatus("page-1", "generating");
    expect(useEditorStore.getState().pageStatuses["page-1"]).toEqual({
      status: "generating",
    });

    useEditorStore
      .getState()
      .setPageStatus("page-1", "failed", "Did not pass the quality gate.");
    expect(useEditorStore.getState().pageStatuses["page-1"]).toEqual({
      status: "failed",
      detail: "Did not pass the quality gate.",
    });

    useEditorStore.getState().clearPageStatuses();
    expect(useEditorStore.getState().pageStatuses).toEqual({});
  });

  it("ignores status updates for unknown pages and removes statuses on delete", () => {
    useEditorStore.getState().setPageStatus("missing-page", "generating");
    expect(
      useEditorStore.getState().pageStatuses["missing-page"],
    ).toBeUndefined();

    useEditorStore.getState().setPageStatus("page-1", "queued");
    useEditorStore.getState().setPageStatus("page-2", "generating");
    useEditorStore.getState().deletePage("page-2");

    const statuses = useEditorStore.getState().pageStatuses;
    expect(statuses["page-1"]).toEqual({ status: "queued" });
    expect(statuses["page-2"]).toBeUndefined();
  });

  it("keeps the same pages and statuses when a replayed event changes nothing", () => {
    const store = useEditorStore.getState();
    store.renamePage("page-1", "Home");
    store.setPageDeviceType("page-1", "mobile");
    store.setPageStatus("page-1", "generating");
    const { pages, pageStatuses } = useEditorStore.getState();

    // Streaming replays every progress event on each tick. Unchanged values
    // must not produce new references, or every page frame re-renders.
    store.renamePage("page-1", "Home");
    store.setPageDeviceType("page-1", "mobile");
    store.setPageStatus("page-1", "generating");

    expect(useEditorStore.getState().pages).toBe(pages);
    expect(useEditorStore.getState().pageStatuses).toBe(pageStatuses);
  });

  it("sets a page device type and sizes mobile frames accordingly", () => {
    useEditorStore.getState().setPageDeviceType("page-2", "mobile");
    const mobilePage = useEditorStore
      .getState()
      .pages.find((page) => page.id === "page-2");
    expect(mobilePage?.deviceType).toBe("mobile");
  });

  it("creates pages with a device type and positions them after the rightmost page", () => {
    const createdPageId = useEditorStore.getState().createPage(
      "Mobile Page",
      undefined,
      undefined,
      "mobile",
    );

    const createdPage = useEditorStore
      .getState()
      .pages.find((page) => page.id === createdPageId);
    expect(createdPage?.deviceType).toBe("mobile");
    expect(useEditorStore.getState().pagePositions[createdPageId]).toBeDefined();
  });
});

describe("applyServerPageChanges", () => {
  const seedPages = () =>
    useEditorStore.setState({
      pages: [
        { id: "page-1", title: "Page 1", iframeHtml: "<p>one</p>", sections: [] },
        { id: "page-2", title: "Page 2", iframeHtml: "<p>two</p>", sections: [] },
      ],
      pagePositions: { "page-1": { x: 0, y: 0 }, "page-2": { x: 1500, y: 0 } },
      pageStackOrder: ["page-1", "page-2"],
    });

  it("swaps changed pages, adds new ones, and drops deleted ones", () => {
    seedPages();
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-3"],
      changed: [
        { id: "page-1", title: "Home", htmlContent: "<p>agent</p>", deviceType: "desktop" },
        { id: "page-3", title: "Pricing", htmlContent: "<p>new</p>", deviceType: "mobile" },
      ],
    });

    const state = useEditorStore.getState();
    expect(
      state.pages.map((page) => [page.id, page.title, page.iframeHtml, page.deviceType]),
    ).toEqual([
      ["page-1", "Home", "<p>agent</p>", "desktop"],
      ["page-3", "Pricing", "<p>new</p>", "mobile"],
    ]);
    expect(state.pageStackOrder).toEqual(["page-1", "page-3"]);
    expect(Object.keys(state.pagePositions).sort()).toEqual(["page-1", "page-3"]);
  });

  it("leaves a page mid-generation untouched, including when the server lacks it", () => {
    seedPages();
    useEditorStore.getState().setPageStatus("page-2", "generating");
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1"],
      changed: [
        { id: "page-2", title: "Stale", htmlContent: "<p>stale</p>", deviceType: "desktop" },
      ],
    });

    expect(useEditorStore.getState().pages.map((page) => page.iframeHtml)).toEqual([
      "<p>one</p>",
      "<p>two</p>",
    ]);
  });

  it("skips the whole poll while a save is in flight", () => {
    seedPages();
    useEditorStore.getState().beginSaving();
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1"],
      changed: [
        { id: "page-1", title: "Old title", htmlContent: "<p>old</p>", deviceType: "desktop" },
      ],
    });
    useEditorStore.getState().endSaving();

    expect(useEditorStore.getState().pages.map((page) => page.title)).toEqual([
      "Page 1",
      "Page 2",
    ]);
  });

  it("keeps the same state object when nothing changed", () => {
    seedPages();
    const before = useEditorStore.getState().pages;
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2"],
      changed: [
        { id: "page-1", title: "Page 1", htmlContent: "<p>one</p>", deviceType: "desktop" },
      ],
    });

    expect(useEditorStore.getState().pages).toBe(before);
  });
});

describe("agent edits", () => {
  it("records an agent write with the html it replaced, and ignores user writes", () => {
    useEditorStore.getState().setPageHtml("page-1", "<p>draft</p>", undefined, "Gemini 3.8 Flash");
    useEditorStore.getState().setPageHtml("page-2", "<p>user</p>");

    const { agentEdits } = useEditorStore.getState();
    expect(Object.keys(agentEdits)).toEqual(["page-1"]);
    expect(agentEdits["page-1"]).toMatchObject({
      label: "Gemini 3.8 Flash",
      html: "<p>draft</p>",
      previousHtml: "",
    });
  });

  it("labels pages the live poll changed as Agent", () => {
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2"],
      changed: [
        { id: "page-2", title: "Page 2", htmlContent: "<p>mcp</p>", deviceType: "desktop" },
      ],
    });

    expect(useEditorStore.getState().agentEdits["page-2"]).toMatchObject({
      label: "Agent",
      html: "<p>mcp</p>",
    });
  });

  it("records only the pages a local-agent pull changed", () => {
    useEditorStore.getState().setPageHtml("page-1", "<p>same</p>");
    useEditorStore.getState().hydrateProject(
      [
        { id: "page-1", title: "Page 1", iframeHtml: "<p>same</p>", sections: [] },
        { id: "page-2", title: "Page 2", iframeHtml: "<p>concept</p>", sections: [] },
      ],
      "MiMo v2.5 (local)",
    );

    const { agentEdits } = useEditorStore.getState();
    expect(Object.keys(agentEdits)).toEqual(["page-2"]);
    expect(agentEdits["page-2"].label).toBe("MiMo v2.5 (local)");
  });
});

describe("useEditorStore page groups", () => {
  it("moves a page between groups and drops the group it empties", () => {
    const store = useEditorStore.getState();
    const first = store.groupPages(["page-1"]);
    const second = useEditorStore.getState().groupPages(["page-1", "page-2", "missing"]);

    const { pageGroups } = useEditorStore.getState();
    expect(pageGroups).toHaveLength(1);
    expect(pageGroups[0].id).toBe(second as string);
    expect(pageGroups[0].pageIds).toEqual(["page-1", "page-2"]);
    expect(first).not.toBe(second);
  });

  it("forgets deleted pages and restores groups from a saved layout", () => {
    useEditorStore.getState().hydratePageLayout({
      pageGroups: [
        { id: "g1", name: "Flow", pageIds: ["page-1", "page-2"] },
        { id: "g2", name: "Stale", pageIds: ["gone"] },
      ],
    });
    expect(useEditorStore.getState().pageGroups).toEqual([
      { id: "g1", name: "Flow", pageIds: ["page-1", "page-2"] },
    ]);

    useEditorStore.getState().deletePage("page-2");
    useEditorStore.getState().renamePageGroup("g1", "  Checkout  ");
    expect(useEditorStore.getState().pageGroups).toEqual([
      { id: "g1", name: "Checkout", pageIds: ["page-1"] },
    ]);

    useEditorStore.getState().ungroupPages("g1");
    expect(useEditorStore.getState().pageGroups).toEqual([]);
  });

  it("moves a page into a group beside its members and back out beside the rest", () => {
    useEditorStore.setState({
      pages: [
        { id: "page-1", title: "Page 1", sections: [] },
        { id: "page-2", title: "Page 2", sections: [] },
        { id: "page-3", title: "Page 3", sections: [] },
      ],
      pagePositions: {
        "page-1": { x: 0, y: 0 },
        "page-2": { x: 1560, y: 0 },
        "page-3": { x: 0, y: 5000 },
      },
      pageGroups: [{ id: "g1", name: "Group 1", pageIds: ["page-1", "page-2"] }],
    });
    const store = useEditorStore.getState();

    store.movePageToGroup("page-3", "g1");
    let state = useEditorStore.getState();
    expect(state.pageGroups[0].pageIds).toEqual(["page-1", "page-2", "page-3"]);
    expect(state.pagePositions["page-3"]).toEqual({ x: 3120, y: 0 });

    store.movePageToGroup("page-1", null);
    state = useEditorStore.getState();
    expect(state.pageGroups[0].pageIds).toEqual(["page-2", "page-3"]);
    expect(state.pagePositions["page-1"]).toEqual({ x: 4680, y: 0 });

    store.movePageToGroup("page-1", "missing");
    expect(useEditorStore.getState().pageGroups[0].pageIds).toEqual(["page-2", "page-3"]);
  });
});

describe("focusComment", () => {
  const comment = (id: string, resolvedAt: string | null) => ({
    id,
    pageId: "page-2",
    nodeId: null,
    body: "Tighten this",
    x: 120,
    y: 900,
    authorUserId: "user-1",
    authorName: "Ana",
    authorAvatarUrl: null,
    resolvedAt,
    createdAt: "2026-10-01T00:00:00.000Z",
  });

  it("opens an open comment and centres its pin at the current zoom", () => {
    useEditorStore.setState({
      comments: [comment("open", null)],
      pagePositions: { "page-2": { x: 2000, y: 0 } },
    });
    const zoom = useEditorStore.getState().camera.zoom;

    useEditorStore.getState().focusComment("open");

    const state = useEditorStore.getState();
    expect(state.activeCommentId).toBe("open");
    expect(state.focusedPageId).toBe("page-2");
    expect(state.camera.zoom).toBe(zoom);
    const view = getViewportSceneBounds(state);
    expect((view.left + view.right) / 2).toBeCloseTo(2120, 0);
    expect((view.top + view.bottom) / 2).toBeCloseTo(900, 0);
  });

  it("shows a resolved comment's page without opening a pin it no longer has", () => {
    useEditorStore.setState({ comments: [comment("done", "2026-10-02T00:00:00.000Z")] });

    useEditorStore.getState().focusComment("done");

    expect(useEditorStore.getState().activeCommentId).toBeNull();
    expect(useEditorStore.getState().focusedPageId).toBe("page-2");
  });
});
