export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ScenePoint {
  x: number;
  y: number;
}

export interface PageBounds {
  pageId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  orientation: "vertical" | "horizontal";
  position: number;
  start: number;
  end: number;
}

export interface SnapResult {
  position: ScenePoint;
  guides: SnapGuide[];
}

export type PageRenderMode = "live" | "shell";

export type PageFrameDevice = "desktop" | "tablet" | "mobile";

export const PAGE_DEVICE_WIDTHS: Record<PageFrameDevice, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

export const PAGE_DEVICE_HEIGHTS: Record<PageFrameDevice, number> = {
  desktop: 900,
  tablet: 1024,
  mobile: 812,
};

export const resolvePageFrameDevice = (
  pageDeviceType: string | null | undefined,
  fallbackDevice: PageFrameDevice,
): PageFrameDevice => {
  if (pageDeviceType === "mobile" || pageDeviceType === "desktop") {
    return pageDeviceType;
  }
  return fallbackDevice;
};

export const getPageFrameWidth = (device: PageFrameDevice) =>
  PAGE_DEVICE_WIDTHS[device];

export const getPageFrameHeight = (device: PageFrameDevice) =>
  PAGE_DEVICE_HEIGHTS[device];

export const MIN_CANVAS_ZOOM = 2;
export const MAX_CANVAS_ZOOM = 200;
export const DEFAULT_CANVAS_ZOOM = 64;
export const CANVAS_TOP_OFFSET = 100;
export const PAGE_GAP = 120;
export const LIVE_PAGE_OVERSCAN_SCENE_PX = 800;

const MIN_FIT_PADDING = 48;
const SNAP_DISTANCE_SCREEN_PX = 8;

export const scaleFromZoom = (zoom: number) => Math.max(0.01, zoom / 100);

export const clampZoom = (zoom: number) =>
  Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));

export const getCanvasAnchor = (viewport: ViewportSize): ScenePoint => ({
  x: viewport.width / 2,
  y: CANVAS_TOP_OFFSET,
});

export const viewportToScene = (
  point: ScenePoint,
  camera: CameraState,
  viewport: ViewportSize,
): ScenePoint => {
  const anchor = getCanvasAnchor(viewport);
  const scale = scaleFromZoom(camera.zoom);

  return {
    x: (point.x - anchor.x - camera.x) / scale,
    y: (point.y - anchor.y - camera.y) / scale,
  };
};

export const sceneToViewport = (
  point: ScenePoint,
  camera: CameraState,
  viewport: ViewportSize,
): ScenePoint => {
  const anchor = getCanvasAnchor(viewport);
  const scale = scaleFromZoom(camera.zoom);

  return {
    x: anchor.x + camera.x + point.x * scale,
    y: anchor.y + camera.y + point.y * scale,
  };
};

export const createBounds = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): Bounds => ({
  left,
  top,
  right,
  bottom,
  width: Math.max(0, right - left),
  height: Math.max(0, bottom - top),
});

export const getViewportBounds = (
  camera: CameraState,
  viewport: ViewportSize,
): Bounds => {
  const topLeft = viewportToScene({ x: 0, y: 0 }, camera, viewport);
  const bottomRight = viewportToScene(
    { x: viewport.width, y: viewport.height },
    camera,
    viewport,
  );

  return createBounds(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
};

export const expandBounds = (bounds: Bounds, amount: number): Bounds =>
  createBounds(
    bounds.left - amount,
    bounds.top - amount,
    bounds.right + amount,
    bounds.bottom + amount,
  );

export const unionBounds = (boundsList: Bounds[]): Bounds | null => {
  if (boundsList.length === 0) {
    return null;
  }

  let left = boundsList[0].left;
  let top = boundsList[0].top;
  let right = boundsList[0].right;
  let bottom = boundsList[0].bottom;

  for (let index = 1; index < boundsList.length; index += 1) {
    const bounds = boundsList[index];
    left = Math.min(left, bounds.left);
    top = Math.min(top, bounds.top);
    right = Math.max(right, bounds.right);
    bottom = Math.max(bottom, bounds.bottom);
  }

  return createBounds(left, top, right, bottom);
};

export const getPageBounds = ({
  pageId,
  position,
  width,
  height,
}: {
  pageId: string;
  position: ScenePoint;
  width: number;
  height: number;
}): PageBounds => ({
  pageId,
  left: position.x,
  top: position.y,
  right: position.x + width,
  bottom: position.y + height,
  width,
  height,
  centerX: position.x + width / 2,
  centerY: position.y + height / 2,
});

export const isBoundsIntersecting = (a: Bounds, b: Bounds) =>
  a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

export const getPageRenderMode = (
  pageBounds: PageBounds,
  viewportBounds: Bounds,
  overscan = LIVE_PAGE_OVERSCAN_SCENE_PX,
): PageRenderMode =>
  isBoundsIntersecting(pageBounds, expandBounds(viewportBounds, overscan))
    ? "live"
    : "shell";

export const getDefaultPageX = (
  index: number,
  totalPages: number,
  pageWidth: number,
) => {
  const totalWidth =
    totalPages * pageWidth + Math.max(0, totalPages - 1) * PAGE_GAP;

  return index * (pageWidth + PAGE_GAP) - totalWidth / 2;
};

/**
 * Picks an x for every page that has no position yet.
 *
 * `getDefaultPageX` centres a whole row and only makes sense when all the pages
 * are placed together. A page that shows up later (a generated concept, an added
 * page) has to go to the right of what is already on the canvas: its neighbours
 * kept positions computed back when the page count was smaller, so reusing the
 * centred slot puts it exactly on top of one of them.
 */
export const placeMissingPages = <T extends { id: string; width: number }>(
  pages: T[],
  positions: Record<string, { x: number } | undefined>,
): Record<string, number> => {
  // Layouts saved before positions were collision-free can hold two pages at the
  // same x. Treat the duplicate as unplaced so an existing canvas repairs itself
  // instead of showing the frames stacked forever.
  const takenX = new Set<number>();
  const keeps = new Set<string>();
  let rightEdge = Number.NEGATIVE_INFINITY;
  for (const page of pages) {
    const placed = positions[page.id];
    if (!placed || takenX.has(placed.x)) continue;
    takenX.add(placed.x);
    keeps.add(page.id);
    rightEdge = Math.max(rightEdge, placed.x + page.width);
  }

  const assigned: Record<string, number> = {};
  pages.forEach((page, index) => {
    if (keeps.has(page.id)) return;
    const x =
      rightEdge === Number.NEGATIVE_INFINITY
        ? getDefaultPageX(index, pages.length, page.width)
        : rightEdge + PAGE_GAP;
    rightEdge = x + page.width;
    assigned[page.id] = x;
  });

  return assigned;
};

export const createDefaultCamera = (): CameraState => ({
  x: 0,
  y: 0,
  zoom: DEFAULT_CANVAS_ZOOM,
});

export const centerOnPoint = ({
  scenePoint,
  viewport,
  zoom,
}: {
  scenePoint: ScenePoint;
  viewport: ViewportSize;
  zoom: number;
}): CameraState => {
  const anchor = getCanvasAnchor(viewport);
  const scale = scaleFromZoom(zoom);

  return {
    x: viewport.width / 2 - anchor.x - scenePoint.x * scale,
    y: viewport.height / 2 - anchor.y - scenePoint.y * scale,
    zoom: clampZoom(zoom),
  };
};

export const fitBounds = ({
  bounds,
  viewport,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM,
  padding = MIN_FIT_PADDING,
}: {
  bounds: Bounds;
  viewport: ViewportSize;
  minZoom?: number;
  maxZoom?: number;
  padding?: number;
}): CameraState => {
  const safePadding = Math.max(MIN_FIT_PADDING, padding);
  const availableWidth = Math.max(1, viewport.width - safePadding * 2);
  const availableHeight = Math.max(
    1,
    viewport.height - safePadding * 2 - CANVAS_TOP_OFFSET,
  );
  const boundedWidth = Math.max(1, bounds.width);
  const boundedHeight = Math.max(1, bounds.height);
  const fittedZoom = clampZoom(
    Math.min(
      (availableWidth / boundedWidth) * 100,
      (availableHeight / boundedHeight) * 100,
    ),
  );
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, fittedZoom));

  return centerOnPoint({
    scenePoint: {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    },
    viewport,
    zoom: clampedZoom,
  });
};

export const zoomAtViewportPoint = ({
  camera,
  viewportPoint,
  viewport,
  nextZoom,
}: {
  camera: CameraState;
  viewportPoint: ScenePoint;
  viewport: ViewportSize;
  nextZoom: number;
}): CameraState => {
  const clampedZoom = clampZoom(nextZoom);
  const scenePoint = viewportToScene(viewportPoint, camera, viewport);
  const anchor = getCanvasAnchor(viewport);
  const scale = scaleFromZoom(clampedZoom);

  return {
    x: viewportPoint.x - anchor.x - scenePoint.x * scale,
    y: viewportPoint.y - anchor.y - scenePoint.y * scale,
    zoom: clampedZoom,
  };
};

const snapDistanceForScale = (scale: number) =>
  SNAP_DISTANCE_SCREEN_PX / Math.max(scale, 0.01);

const lineValues = (bounds: PageBounds) => ({
  vertical: [bounds.left, bounds.centerX, bounds.right],
  horizontal: [bounds.top, bounds.centerY, bounds.bottom],
});

export const getSnappedPagePosition = ({
  movingPageId,
  position,
  width,
  height,
  otherPages,
  scale,
  disabled = false,
}: {
  movingPageId: string;
  position: ScenePoint;
  width: number;
  height: number;
  otherPages: PageBounds[];
  scale: number;
  disabled?: boolean;
}): SnapResult => {
  if (disabled) {
    return { position, guides: [] };
  }

  const movingBounds = getPageBounds({
    pageId: movingPageId,
    position,
    width,
    height,
  });
  const threshold = snapDistanceForScale(scale);
  let bestVertical:
    | { delta: number; guide: SnapGuide }
    | null = null;
  let bestHorizontal:
    | { delta: number; guide: SnapGuide }
    | null = null;

  const movingLines = lineValues(movingBounds);

  for (const page of otherPages) {
    if (page.pageId === movingPageId) {
      continue;
    }
    const pageLines = lineValues(page);

    for (const movingLine of movingLines.vertical) {
      for (const pageLine of pageLines.vertical) {
        const delta = pageLine - movingLine;
        if (Math.abs(delta) > threshold) {
          continue;
        }
        if (!bestVertical || Math.abs(delta) < Math.abs(bestVertical.delta)) {
          bestVertical = {
            delta,
            guide: {
              orientation: "vertical",
              position: pageLine,
              start: Math.min(movingBounds.top, page.top),
              end: Math.max(movingBounds.bottom, page.bottom),
            },
          };
        }
      }
    }

    for (const movingLine of movingLines.horizontal) {
      for (const pageLine of pageLines.horizontal) {
        const delta = pageLine - movingLine;
        if (Math.abs(delta) > threshold) {
          continue;
        }
        if (
          !bestHorizontal ||
          Math.abs(delta) < Math.abs(bestHorizontal.delta)
        ) {
          bestHorizontal = {
            delta,
            guide: {
              orientation: "horizontal",
              position: pageLine,
              start: Math.min(movingBounds.left, page.left),
              end: Math.max(movingBounds.right, page.right),
            },
          };
        }
      }
    }
  }

  return {
    position: {
      x: position.x + (bestVertical?.delta ?? 0),
      y: position.y + (bestHorizontal?.delta ?? 0),
    },
    guides: [bestVertical?.guide, bestHorizontal?.guide].filter(
      (guide): guide is SnapGuide => Boolean(guide),
    ),
  };
};
