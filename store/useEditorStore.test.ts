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
});
