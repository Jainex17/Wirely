import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDefaultCamera } from "@/lib/canvasScene";
import { useEditorStore } from "@/store/useEditorStore";

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

  it("assigns a non-overlapping position when creating a page", () => {
    useEditorStore.getState().setPagePosition("page-1", { x: -1560, y: 0 });
    useEditorStore.getState().setPagePosition("page-2", { x: 0, y: 0 });

    const createdPageId = useEditorStore.getState().createPage("Page 3");
    const state = useEditorStore.getState();

    expect(state.pagePositions[createdPageId]).toEqual({ x: 1560, y: 0 });
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
