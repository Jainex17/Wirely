import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDefaultCamera } from "@/lib/canvasScene";
import { getViewportSceneBounds, stopCameraGlide, useEditorStore } from "@/store/useEditorStore";

const resetStore = () => {
  useEditorStore.setState({
    ...useEditorStore.getInitialState(),
    ...{
      pages: [
        { id: "page-1", title: "Page 1", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", sections: [], tabId: "tab-home" },
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
      pages: ["page-1", "page-2", "page-3"].map((id) => ({ id, title: id, sections: [], tabId: "tab-home" })),
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
      pages: ["page-1", "page-2"].map((id) => ({ id, title: id, sections: [], tabId: "tab-home" })),
      pageFrameHeights: { "page-2": 1800 },
    });
    useEditorStore.getState().hydratePageLayout({
      pageFrameHeights: { "page-1": 4200, "page-2": 900, gone: 3000, "page-3": Number.NaN },
    });

    expect(useEditorStore.getState().pageFrameHeights).toEqual({ "page-1": 4200, "page-2": 1800 });
  });

  it("focuses a page at the zoom that fits its first screen, from any starting zoom", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: 0, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 2200, y: 0 });
    useEditorStore.getState().setPageFrameHeight("page-2", 1400);

    useEditorStore.getState().setCamera({ x: 0, y: 0, zoom: 20 });
    useEditorStore.getState().focusPage("page-2");
    const fromZoomedOut = useEditorStore.getState().camera;

    useEditorStore.getState().setCamera({ x: 0, y: 0, zoom: 300 });
    useEditorStore.getState().focusPage("page-2");
    const fromZoomedIn = useEditorStore.getState().camera;

    expect(useEditorStore.getState().focusedPageId).toBe("page-2");
    expect(fromZoomedIn).toEqual(fromZoomedOut);
    expect(fromZoomedOut.zoom).toBeGreaterThan(20);
    expect(fromZoomedOut.zoom).toBeLessThanOrEqual(100);
    expect(fromZoomedOut.x).toBeLessThan(0);
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
        { id: "page-1", title: "Page 1", iframeHtml: "<p>one</p>", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", iframeHtml: "<p>two</p>", sections: [], tabId: "tab-home" },
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
        { id: "page-1", title: "Page 1", iframeHtml: "<p>same</p>", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", iframeHtml: "<p>concept</p>", sections: [], tabId: "tab-home" },
      ],
      { agentLabel: "MiMo v2.5 (local)" },
    );

    const { agentEdits } = useEditorStore.getState();
    expect(Object.keys(agentEdits)).toEqual(["page-2"]);
    expect(agentEdits["page-2"].label).toBe("MiMo v2.5 (local)");
  });
});

describe("useEditorStore page groups", () => {
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
        { id: "page-1", title: "Page 1", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", sections: [], tabId: "tab-home" },
        { id: "page-3", title: "Page 3", sections: [], tabId: "tab-home" },
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

describe("applyCanvasArrangement", () => {
  const arrangement = {
    rows: [[{ name: "Mobile", pageIds: ["page-2"] }], [{ name: "Website", pageIds: ["page-1"] }]],
    arrangedAt: "2026-11-08T10:00:00.000Z",
  };

  beforeEach(() => {
    useEditorStore.setState({
      pages: [
        { id: "page-1", title: "Home", sections: [], tabId: "tab-home", deviceType: "desktop" },
        { id: "page-2", title: "App", sections: [], tabId: "tab-home", deviceType: "mobile" },
      ],
      viewportSize: { width: 0, height: 0 },
    });
  });

  it("groups the pages into rows and pushes the lower row down as a frame grows", () => {
    const store = useEditorStore.getState();
    store.applyCanvasArrangement(arrangement);
    expect(useEditorStore.getState().pageGroups.map((group) => group.name)).toEqual(["Mobile", "Website"]);
    const firstRowBottom = 812;
    expect(useEditorStore.getState().pagePositions["page-1"].y).toBeGreaterThan(firstRowBottom);

    store.setPageFrameHeight("page-2", 3000);
    expect(useEditorStore.getState().pagePositions["page-1"].y).toBeGreaterThan(3000);
  });

  it("applies an arrangement once, and stops re-flowing after the user drags a page", () => {
    const store = useEditorStore.getState();
    store.applyCanvasArrangement(arrangement);
    store.setPagePositions({ "page-1": { x: 5000, y: 5000 } });

    store.setPageFrameHeight("page-2", 3000);
    store.applyCanvasArrangement(arrangement);
    expect(useEditorStore.getState().pagePositions["page-1"]).toEqual({ x: 5000, y: 5000 });

    store.applyCanvasArrangement({ ...arrangement, arrangedAt: "2026-11-08T11:00:00.000Z" });
    expect(useEditorStore.getState().pagePositions["page-1"].x).toBe(0);
  });

  it("keeps re-flowing rows after a reload that restores a live arrangement", () => {
    const store = useEditorStore.getState();
    store.applyCanvasArrangement(arrangement);
    const saved = useEditorStore.getState();
    store.hydratePageLayout({
      pagePositions: saved.pagePositions,
      pageGroups: saved.pageGroups,
      arrangedAt: saved.arrangedAt,
      arrangement: saved.arrangement,
    });

    store.setPageFrameHeight("page-2", 3000);
    expect(useEditorStore.getState().pagePositions["page-1"].y).toBeGreaterThan(3000);
  });

  it("ignores a saved arrangement that does not parse", () => {
    useEditorStore.getState().hydratePageLayout({ arrangement: { rows: "nope" } });
    expect(useEditorStore.getState().arrangement).toBeNull();
  });

  it("puts a page that arrives a poll after its arrangement into its group, keeping a rename", () => {
    const store = useEditorStore.getState();
    store.applyCanvasArrangement({
      rows: [
        [{ name: "Mobile", pageIds: ["page-2", "page-3"] }, { name: "Late", pageIds: ["page-4"] }],
        [{ name: "Website", pageIds: ["page-1"] }],
      ],
      arrangedAt: arrangement.arrangedAt,
    });
    const mobile = useEditorStore.getState().pageGroups.find((group) => group.name === "Mobile");
    store.renamePageGroup(mobile!.id, "Phone");

    store.applyServerPageChanges({
      pageIds: ["page-1", "page-2", "page-3", "page-4"],
      changed: ["page-3", "page-4"].map((id) => ({ id, title: id, htmlContent: "<p></p>", deviceType: "mobile" })),
    });

    const state = useEditorStore.getState();
    expect(state.pageGroups.map((group) => [group.name, group.pageIds])).toEqual([
      ["Phone", ["page-2", "page-3"]],
      ["Late", ["page-4"]],
      ["Website", ["page-1"]],
    ]);
    expect(state.pagePositions["page-3"].y).toBe(0);
  });

  it("does not apply an arrangement the saved layout already holds", () => {
    const store = useEditorStore.getState();
    store.hydratePageLayout({
      pagePositions: { "page-1": { x: 900, y: 0 }, "page-2": { x: 0, y: 0 } },
      arrangedAt: arrangement.arrangedAt,
    });
    store.applyCanvasArrangement(arrangement);
    expect(useEditorStore.getState().pagePositions["page-1"]).toEqual({ x: 900, y: 0 });
    expect(useEditorStore.getState().pageGroups).toEqual([]);
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

describe("camera glide", () => {
  // Bun has no window, so focus jumps straight there in every other test. These
  // tests stand in a window whose animation frames run only when stepped.
  let queued: FrameRequestCallback[] = [];
  let reducedMotion = false;
  let now = 0;
  const step = (ms: number) => {
    now += ms;
    const callbacks = queued;
    queued = [];
    callbacks.forEach((callback) => callback(now));
  };
  const runToEnd = () => {
    for (let frame = 0; frame < 200 && queued.length > 0; frame += 1) step(16);
  };
  const focusTarget = () => {
    const camera = useEditorStore.getState().camera;
    useEditorStore.getState().focusPage("page-2");
    runToEnd();
    const target = useEditorStore.getState().camera;
    useEditorStore.getState().setCamera(camera);
    return target;
  };

  beforeEach(() => {
    queued = [];
    reducedMotion = false;
    now = 0;
    Object.assign(globalThis, {
      window: {
        requestAnimationFrame: (callback: FrameRequestCallback) => queued.push(callback),
        cancelAnimationFrame: () => {
          queued = [];
        },
        matchMedia: () => ({ matches: reducedMotion }),
      },
    });
    useEditorStore.getState().setPagePosition("page-1", { x: 0, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 2200, y: 0 });
    useEditorStore.getState().setCamera({ x: 0, y: 0, zoom: 40 });
  });

  afterEach(() => {
    stopCameraGlide();
    Reflect.deleteProperty(globalThis, "window");
  });

  it("passes through the space between and lands on the fitted camera", () => {
    const target = focusTarget();

    useEditorStore.getState().focusPage("page-2");
    step(0);
    step(300);
    const midway = useEditorStore.getState().camera;
    runToEnd();

    expect(midway.x).toBeLessThan(0);
    expect(midway.x).toBeGreaterThan(target.x);
    expect(midway.zoom).toBeGreaterThan(40);
    expect(midway.zoom).toBeLessThan(target.zoom);
    expect(useEditorStore.getState().camera).toEqual(target);
  });

  it("gives way to a camera write from elsewhere", () => {
    useEditorStore.getState().focusPage("page-2");
    step(0);
    step(100);
    useEditorStore.getState().setCamera({ x: 5, y: 5, zoom: 80 });
    runToEnd();

    expect(useEditorStore.getState().camera).toEqual({ x: 5, y: 5, zoom: 80 });
  });

  it("stays where it is when a drag stops it", () => {
    useEditorStore.getState().focusPage("page-2");
    step(0);
    step(100);
    const stoppedAt = useEditorStore.getState().camera;
    stopCameraGlide();
    runToEnd();

    expect(useEditorStore.getState().camera).toBe(stoppedAt);
  });

  it("jumps straight to the page under reduced motion", () => {
    const target = focusTarget();
    reducedMotion = true;

    useEditorStore.getState().focusPage("page-2");

    expect(useEditorStore.getState().camera).toEqual(target);
    expect(queued).toHaveLength(0);
  });
});

describe("useEditorStore focus requests", () => {
  it("counts focusing a page that already has focus", () => {
    const before = useEditorStore.getState().focusRequestCount;
    useEditorStore.getState().setFocusedPage("page-1");
    useEditorStore.getState().focusPage("page-1");
    expect(useEditorStore.getState().focusRequestCount).toBe(before + 2);
  });

  it("does not count focus that moves because the focused page was deleted", () => {
    const before = useEditorStore.getState().focusRequestCount;
    useEditorStore.getState().deletePage("page-1");
    expect(useEditorStore.getState().focusedPageId).toBe("page-2");
    expect(useEditorStore.getState().focusRequestCount).toBe(before);
  });
});

describe("page selection", () => {
  it("shift-click adds pages, and removes a set only when all of it is picked", () => {
    const { setSelectedPageIds, toggleSelectedPages } = useEditorStore.getState();
    setSelectedPageIds(["page-1"]);

    toggleSelectedPages(["page-2", "page-3"]);
    expect(useEditorStore.getState().selectedPageIds).toEqual(["page-1", "page-2", "page-3"]);

    // A group partly picked gets the rest of its pages, not a removal.
    toggleSelectedPages(["page-1"]);
    toggleSelectedPages(["page-1", "page-2"]);
    expect(useEditorStore.getState().selectedPageIds).toEqual(["page-2", "page-3", "page-1"]);

    toggleSelectedPages(["page-1", "page-2"]);
    expect(useEditorStore.getState().selectedPageIds).toEqual(["page-3"]);
  });

  it("drops a deleted page from the selection", () => {
    useEditorStore.getState().setSelectedPageIds(["page-1", "page-2"]);
    useEditorStore.getState().deletePage("page-1");
    expect(useEditorStore.getState().selectedPageIds).toEqual(["page-2"]);
  });
});

describe("project tabs", () => {
  const seedTabs = () =>
    useEditorStore.setState({
      tabs: [
        { id: "tab-home", name: "Tab 1" },
        { id: "tab-b", name: "Mobile" },
      ],
      pages: [
        { id: "page-1", title: "Page 1", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", sections: [], tabId: "tab-home" },
        { id: "page-3", title: "Page 3", sections: [], tabId: "tab-b" },
      ],
      pagePositions: {
        "page-1": { x: 0, y: 0 },
        "page-2": { x: 5000, y: 0 },
        "page-3": { x: 0, y: 0 },
      },
      pageStackOrder: ["page-1", "page-2", "page-3"],
      pageGroups: [{ id: "g1", name: "Web", pageIds: ["page-1", "page-2"] }],
      activeTabId: "tab-home",
      focusedPageId: "page-1",
      selectedPageIds: ["page-2"],
    });

  it("scopes fitting and placement to the open tab, and stashes the camera it leaves", () => {
    seedTabs();
    useEditorStore.getState().setCamera({ x: 10, y: 20, zoom: 50 });

    const onHome = useEditorStore.getState().createPage("Home row");
    expect(useEditorStore.getState().pagePositions[onHome]).toEqual({ x: 0, y: 1020 });

    useEditorStore.getState().switchTab("tab-b");
    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe("tab-b");
    expect(state.tabCameras["tab-home"]).toEqual({ x: 10, y: 20, zoom: 50 });
    expect(state.focusedPageId).toBe("page-3");
    expect(state.selectedPageIds).toEqual([]);
    // One desktop page fits the 1400 by 900 viewport by its height: (900 - 96 - 100) / 900.
    expect(state.camera.zoom).toBeCloseTo(78.222, 3);

    const onMobile = useEditorStore.getState().createPage("Mobile row");
    expect(useEditorStore.getState().pages.find((page) => page.id === onMobile)?.tabId).toBe("tab-b");
    expect(useEditorStore.getState().pagePositions[onMobile]).toEqual({ x: 0, y: 1020 });

    useEditorStore.getState().switchTab("tab-home");
    expect(useEditorStore.getState().camera).toEqual({ x: 10, y: 20, zoom: 50 });
  });

  it("focusing a page on another tab shows that tab first", () => {
    seedTabs();
    useEditorStore.getState().focusPage("page-3");

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe("tab-b");
    expect(state.focusedPageId).toBe("page-3");
    expect(state.selectedPageIds).toEqual([]);
    expect(state.tabCameras["tab-home"]).toEqual(createDefaultCamera());
  });

  it("moves a page to another tab, out of its group and beside the pages there", () => {
    seedTabs();
    useEditorStore.getState().movePageToTab("page-2", "tab-b");

    const state = useEditorStore.getState();
    expect(state.pages.find((page) => page.id === "page-2")?.tabId).toBe("tab-b");
    expect(state.pagePositions["page-2"]).toEqual({ x: 1560, y: 0 });
    expect(state.pageGroups).toEqual([{ id: "g1", name: "Web", pageIds: ["page-1"] }]);
    expect(state.activeTabId).toBe("tab-home");
    expect(state.selectedPageIds).toEqual([]);
    expect(state.focusedPageId).toBe("page-1");
  });

  it("takes tabs and page tabs from a poll, placing new and moved pages on their own tab", () => {
    useEditorStore.setState({
      pages: [
        { id: "page-1", title: "Page 1", sections: [], tabId: "tab-home" },
        { id: "page-2", title: "Page 2", sections: [], tabId: "tab-home" },
      ],
      pagePositions: { "page-1": { x: 0, y: 0 }, "page-2": { x: 1560, y: 0 } },
      pageGroups: [{ id: "g1", name: "Web", pageIds: ["page-1", "page-2"] }],
    });
    const tabs = [
      { id: "tab-home", name: "Tab 1" },
      { id: "tab-b", name: "Mobile" },
    ];

    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2", "page-3"],
      changed: [{ id: "page-3", title: "App", htmlContent: "<p>app</p>", deviceType: "desktop" }],
      tabs,
      pageTabIds: { "page-1": "tab-home", "page-2": "tab-home", "page-3": "tab-b" },
    });
    let state = useEditorStore.getState();
    expect(state.tabs).toEqual(tabs);
    expect(state.pages.map((page) => [page.id, page.tabId])).toEqual([
      ["page-1", "tab-home"],
      ["page-2", "tab-home"],
      ["page-3", "tab-b"],
    ]);
    expect(state.pagePositions["page-3"]).toEqual({ x: -720, y: 0 });
    expect(state.activeTabId).toBe("tab-home");

    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2", "page-3"],
      changed: [],
      tabs,
      pageTabIds: { "page-1": "tab-home", "page-2": "tab-b", "page-3": "tab-b" },
    });
    state = useEditorStore.getState();
    expect(state.pages.find((page) => page.id === "page-2")?.tabId).toBe("tab-b");
    expect(state.pagePositions["page-2"]).toEqual({ x: 840, y: 0 });
    expect(state.pageGroups).toEqual([{ id: "g1", name: "Web", pageIds: ["page-1"] }]);
  });

  it("switches to the first tab when a poll says the open one is gone", () => {
    seedTabs();
    useEditorStore.getState().switchTab("tab-b");
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2"],
      changed: [],
      tabs: [{ id: "tab-home", name: "Tab 1" }],
      pageTabIds: { "page-1": "tab-home", "page-2": "tab-home" },
    });

    const state = useEditorStore.getState();
    expect(state.activeTabId).toBe("tab-home");
    expect(state.tabs).toEqual([{ id: "tab-home", name: "Tab 1" }]);
    expect(state.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
    expect(state.focusedPageId).toBe("page-1");
    expect(state.camera).toEqual(createDefaultCamera());
  });

  it("arranges one tab without moving or ungrouping pages on another", () => {
    seedTabs();
    useEditorStore.setState({
      pagePositions: {
        "page-1": { x: 900, y: 900 },
        "page-2": { x: 5000, y: 0 },
        "page-3": { x: 123, y: 456 },
      },
      pageGroups: [{ id: "gb", name: "Keep", pageIds: ["page-3"] }],
    });

    useEditorStore.getState().applyCanvasArrangement({
      rows: [[{ name: "Web", pageIds: ["page-1", "page-2"] }]],
      arrangedAt: "2026-11-09T10:00:00.000Z",
    });

    const state = useEditorStore.getState();
    expect(state.pagePositions).toEqual({
      "page-1": { x: 0, y: 0 },
      "page-2": { x: 1560, y: 0 },
      "page-3": { x: 123, y: 456 },
    });
    expect(state.pageGroups).toEqual([
      { id: "gb", name: "Keep", pageIds: ["page-3"] },
      { id: "tab-home:arranged-0-0", name: "Web", pageIds: ["page-1", "page-2"] },
    ]);
  });

  it("lays out each arranged tab from its own origin with its own group ids", () => {
    seedTabs();
    useEditorStore.getState().applyCanvasArrangement({
      rows: [
        [{ name: "Web", pageIds: ["page-1", "page-2"] }],
        [{ name: "Phone", pageIds: ["page-3"] }],
      ],
      arrangedAt: "2026-11-09T11:00:00.000Z",
    });

    let state = useEditorStore.getState();
    expect(state.pagePositions["page-3"]).toEqual({ x: 0, y: 0 });
    expect(state.pageGroups.map((group) => group.id)).toEqual([
      "tab-home:arranged-0-0",
      "tab-b:arranged-1-0",
    ]);

    useEditorStore.getState().ungroupPages("tab-b:arranged-1-0");
    state = useEditorStore.getState();
    expect(state.pageGroups).toEqual([
      { id: "tab-home:arranged-0-0", name: "Web", pageIds: ["page-1", "page-2"] },
    ]);
  });

  it("keeps a saved position that another tab's page shares on reload", () => {
    seedTabs();
    useEditorStore.getState().hydratePageLayout({
      pagePositions: {
        "page-1": { x: 0, y: 0 },
        "page-2": { x: 5000, y: 0 },
        "page-3": { x: 0, y: 0 },
      },
    });
    expect(useEditorStore.getState().pagePositions).toEqual({
      "page-1": { x: 0, y: 0 },
      "page-2": { x: 5000, y: 0 },
      "page-3": { x: 0, y: 0 },
    });
  });

  it("ends a live arrangement when a poll moves one of its pages to another tab", () => {
    seedTabs();
    useEditorStore.getState().applyCanvasArrangement({
      rows: [[{ name: "Web", pageIds: ["page-1", "page-2"] }]],
      arrangedAt: "2026-11-09T12:00:00.000Z",
    });
    useEditorStore.getState().applyServerPageChanges({
      pageIds: ["page-1", "page-2", "page-3"],
      changed: [],
      tabs: [
        { id: "tab-home", name: "Tab 1" },
        { id: "tab-b", name: "Mobile" },
      ],
      pageTabIds: { "page-1": "tab-home", "page-2": "tab-b", "page-3": "tab-b" },
    });

    const state = useEditorStore.getState();
    expect(state.arrangement).toBe(null);
    expect(state.pages.find((page) => page.id === "page-2")?.tabId).toBe("tab-b");
    expect(state.pageGroups).toEqual([
      { id: "tab-home:arranged-0-0", name: "Web", pageIds: ["page-1"] },
    ]);
  });
});
