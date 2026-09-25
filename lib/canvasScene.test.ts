import { describe, expect, it } from "bun:test";
import {
  CANVAS_TOP_OFFSET,
  PAGE_GAP,
  createBounds,
  createDefaultCamera,
  fitBounds,
  getPageBounds,
  getPageRenderMode,
  getSnappedPagePosition,
  getViewportBounds,
  clipToFirstScreen,
  placeMissingPages,
  scaleFromZoom,
  stepZoom,
  arrangePagePositions,
  sceneToViewport,
  viewportToScene,
  zoomAtViewportPoint,
} from "@/lib/canvasScene";

describe("canvasScene helpers", () => {
  it("round-trips scene and viewport coordinates", () => {
    const camera = { x: 120, y: -80, zoom: 75 };
    const viewport = { width: 1200, height: 800 };
    const scenePoint = { x: 300, y: 220 };

    const viewportPoint = sceneToViewport(scenePoint, camera, viewport);
    const nextScenePoint = viewportToScene(viewportPoint, camera, viewport);

    expect(Math.round(nextScenePoint.x)).toBe(scenePoint.x);
    expect(Math.round(nextScenePoint.y)).toBe(scenePoint.y);
  });

  it("keeps the same scene point under the cursor when zooming", () => {
    const viewport = { width: 1200, height: 900 };
    const camera = createDefaultCamera();
    const viewportPoint = { x: 720, y: 410 };
    const scenePointBefore = viewportToScene(viewportPoint, camera, viewport);

    const nextCamera = zoomAtViewportPoint({
      camera,
      viewportPoint,
      viewport,
      nextZoom: 125,
    });
    const scenePointAfter = viewportToScene(viewportPoint, nextCamera, viewport);

    expect(Math.round(scenePointAfter.x)).toBe(Math.round(scenePointBefore.x));
    expect(Math.round(scenePointAfter.y)).toBe(Math.round(scenePointBefore.y));
  });

  it("fits bounds into the available viewport", () => {
    const viewport = { width: 1400, height: 900 };
    const bounds = createBounds(-720, 0, 720, 1200);
    const camera = fitBounds({
      bounds,
      viewport,
    });
    const viewportBounds = getViewportBounds(camera, viewport);

    expect(viewportBounds.left).toBeLessThanOrEqual(bounds.left);
    expect(viewportBounds.right).toBeGreaterThanOrEqual(bounds.right);
    expect(viewportBounds.top).toBeLessThanOrEqual(bounds.top);
    expect(viewportBounds.bottom).toBeGreaterThanOrEqual(bounds.bottom);
  });

  it("classifies offscreen pages into shell render mode", () => {
    const viewportBounds = createBounds(-600, -CANVAS_TOP_OFFSET, 600, 700);
    const pageBounds = getPageBounds({
      pageId: "page-2",
      position: { x: 5000, y: 0 },
      width: 1440,
      height: 900,
    });

    expect(getPageRenderMode(pageBounds, viewportBounds)).toBe("shell");
  });

  it("snaps page positions to nearby page edges and centers", () => {
    const otherPage = getPageBounds({
      pageId: "page-1",
      position: { x: 0, y: 0 },
      width: 1440,
      height: 900,
    });

    const snapped = getSnappedPagePosition({
      movingPageId: "page-2",
      position: { x: 6, y: 4 },
      width: 1440,
      height: 900,
      otherPages: [otherPage],
      scale: scaleFromZoom(100),
    });

    expect(snapped.position.x).toBe(0);
    expect(snapped.position.y).toBe(0);
    expect(snapped.guides.length).toBeGreaterThan(0);
  });
});

describe("placeMissingPages", () => {
  const W = 1440;
  const page = (id: string) => ({ id, width: W });

  it("spreads a fresh project the same way the centred default does", () => {
    const pages = [page("a"), page("b"), page("c")];
    const assigned = placeMissingPages(pages, {});
    const xs = pages.map((p) => assigned[p.id]);

    expect(xs[1] - xs[0]).toBe(W + PAGE_GAP);
    expect(xs[2] - xs[1]).toBe(W + PAGE_GAP);
    // Centred on the origin.
    expect(xs[0] + xs[2] + W).toBe(0);
  });

  it("never places a newcomer on top of a page positioned at a smaller count", () => {
    // A lone page keeps the slot it got when it was the only one.
    const alone = placeMissingPages([page("a")], {});
    expect(alone.a).toBe(-W / 2);

    // Two concepts then land. Under the old index-based rule, the page at
    // index 1 of 3 computed the same -720 the lone page already held.
    const positions = { a: { x: alone.a } };
    const assigned = placeMissingPages(
      [page("a"), page("b"), page("c")],
      positions,
    );

    expect(assigned.a).toBeUndefined();
    const all = [positions.a.x, assigned.b, assigned.c];
    expect(new Set(all).size).toBe(3);
    expect(assigned.b).toBeGreaterThanOrEqual(positions.a.x + W);
    expect(assigned.c).toBeGreaterThanOrEqual(assigned.b + W);
  });

  it("leaves a dragged page where the user put it", () => {
    const assigned = placeMissingPages(
      [page("a"), page("b")],
      { a: { x: 5000 } },
    );
    expect(assigned.a).toBeUndefined();
    expect(assigned.b).toBe(5000 + W + PAGE_GAP);
  });

  it("repairs a saved layout that already has two pages stacked", () => {
    // Exactly the state observed on a real project: two pages at x -720.
    const assigned = placeMissingPages(
      [page("a"), page("b"), page("c")],
      { a: { x: -720 }, b: { x: -720 }, c: { x: 840 } },
    );

    expect(assigned.a).toBeUndefined();
    expect(assigned.c).toBeUndefined();
    expect(assigned.b).toBeGreaterThanOrEqual(840 + W);
  });
});

describe("canvas view helpers", () => {
  it("steps zoom to the next preset in either direction", () => {
    expect(stepZoom(64, 1)).toBe(75);
    expect(stepZoom(64, -1)).toBe(50);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(2, -1)).toBe(2);
  });

  it("clips a tall page to its first screen and leaves a short one alone", () => {
    const tall = getPageBounds({ pageId: "a", position: { x: 0, y: 0 }, width: 1440, height: 6000 });
    const short = getPageBounds({ pageId: "b", position: { x: 0, y: 0 }, width: 1440, height: 600 });

    expect(clipToFirstScreen(tall, 900).height).toBe(900);
    expect(clipToFirstScreen(tall, 900).top).toBe(0);
    expect(clipToFirstScreen(short, 900).height).toBe(600);
  });

  it("arranges pages into one top-aligned row in their left-to-right order", () => {
    const positions = arrangePagePositions(
      [
        { id: "right", x: 3000, y: 400, width: 375, height: 812 },
        { id: "left", x: -200, y: -50, width: 1440, height: 900 },
      ],
      "row",
    );

    expect(positions.left).toEqual({ x: -200, y: 0 });
    expect(positions.right).toEqual({ x: -200 + 1440 + PAGE_GAP, y: 0 });
  });

  it("arranges pages into a grid whose rows clear the tallest page above", () => {
    const pages = ["a", "b", "c", "d"].map((id, index) => ({
      id,
      x: index * 2000,
      y: 0,
      width: 1440,
      height: id === "b" ? 5000 : 900,
    }));

    const positions = arrangePagePositions(pages, "grid");

    expect(positions.a).toEqual({ x: 0, y: 0 });
    expect(positions.b).toEqual({ x: 1440 + PAGE_GAP, y: 0 });
    expect(positions.c).toEqual({ x: 0, y: 5000 + PAGE_GAP });
    expect(positions.d.y).toBe(5000 + PAGE_GAP);
  });
});
