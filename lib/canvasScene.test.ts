import { describe, expect, it } from "bun:test";
import {
  CANVAS_TOP_OFFSET,
  createBounds,
  createDefaultCamera,
  fitBounds,
  getPageBounds,
  getPageRenderMode,
  getSnappedPagePosition,
  getViewportBounds,
  scaleFromZoom,
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
