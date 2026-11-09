"use client";

import React from "react";
import { Ungroup } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { logger } from "@/lib/logger";
import {
  CANVAS_BACKGROUND_COLORS,
  type CanvasBackground,
  stopCameraGlide,
  useEditorStore,
} from "@/store/useEditorStore";
import CanvasToolbar from "./CanvasToolbar";
import CanvasCommentPins from "./CanvasCommentPins";
import PageRenderer from "./PageRenderer";
import type { ReportedNode } from "@/lib/nodePicker";
import type { PageRecord } from "@/lib/types";
import {
  type CameraState,
  type CanvasTool,
  type PageBounds,
  type PageRenderMode,
  type ScenePoint,
  type SnapGuide,
  CANVAS_TOP_OFFSET,
  GROUP_FRAME_PADDING,
  PAGE_FRAME_TOP,
  clampZoom,
  getDefaultPageX,
  getEdgePanVelocity,
  getSharpPageIds,
  createBounds,
  getPageBounds,
  getPageFrameHeight,
  getViewportBounds,
  isBoundsIntersecting,
  getPageFrameWidth,
  isInsertTool,
  movePagesWith,
  getSnappedPagePosition,
  placeMissingPages,
  unionBounds,
  getPageFrameSize,
  type PageFrameDevice,
  resolvePageFrameDevice,
  scaleFromZoom,
  viewportToScene,
  zoomAtViewportPoint,
} from "@/lib/canvasScene";
import { ASSET_DRAG_TYPE, parseAssetDrag } from "@/lib/assetDrag";
import { createAssetPage } from "@/store/pageEdits";

const DEVICE_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
} as const;

// One object per device, so the memoized PageRenderer sees the same prop on
// every drag move and pan instead of re-rendering every page.
const DEVICE_FRAMES = Object.fromEntries(
  (["desktop", "tablet", "mobile"] as const).map((device) => [
    device,
    {
      width: getPageFrameWidth(device),
      height: getPageFrameHeight(device),
      label: DEVICE_LABELS[device],
    },
  ]),
) as Record<keyof typeof DEVICE_LABELS, { width: number; height: number; label: string }>;

// Vector frames take their artboard's size. Cached by size for the same
// reason as DEVICE_FRAMES: a stable prop keeps the memoized frame still.
const VECTOR_FRAMES = new Map<string, { width: number; height: number; label: string }>();

const getCanvasFrame = (page: PageRecord, activeDevice: PageFrameDevice) => {
  if (page.deviceType !== "vector") {
    return DEVICE_FRAMES[resolvePageFrameDevice(page.deviceType, activeDevice)];
  }
  const { width, height } = getPageFrameSize(page, activeDevice);
  const key = `${width}x${height}`;
  const frame = VECTOR_FRAMES.get(key) ?? { width, height, label: "Vector" };
  VECTOR_FRAMES.set(key, frame);
  return frame;
};

// Frame labels sit on the canvas, so light backgrounds swap them to dark text.
const CANVAS_BACKGROUND_STYLES: Record<CanvasBackground, React.CSSProperties> = {
  dark: {},
  gray: {
    backgroundColor: CANVAS_BACKGROUND_COLORS.gray,
    ["--canvas-label" as string]: "#262626",
    ["--canvas-label-strong" as string]: "#111111",
  },
  light: {
    backgroundColor: CANVAS_BACKGROUND_COLORS.light,
    ["--canvas-label" as string]: "#6b6b6b",
    ["--canvas-label-strong" as string]: "#111111",
  },
};

const DRAG_START_THRESHOLD_PX = 4;
const LAYOUT_SAVE_IDLE_MS = 700;
const CAMERA_LAYER_IDLE_MS = 150;
// How long the camera rests before on-screen pages swap their snapshots for
// sharp DOM. Mid-gesture every page stays a picture.
const SHARPEN_IDLE_MS = 200;
// How far the zoom may move from the scale the scene layer was rastered at
// before it rasters again. Zoomed out by this factor, the layer holds about its
// square, 2.25 times, the tiles the screen shows.
const MAX_LAYER_SCALE_DRIFT = 1.5;

interface PointerDragState {
  pageId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialPosition: ScenePoint;
  /** Every page the drag moves, the dragged one included, where it started. */
  initialPositions: Record<string, ScenePoint>;
  initialCamera: CameraState;
  hasMoved: boolean;
}

interface GroupDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialCamera: CameraState;
  initialPositions: Record<string, ScenePoint>;
}

interface CanvasPanState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialCamera: CameraState;
}

interface PinchState {
  lastCenter: ScenePoint;
  initialDistance: number;
}

interface CanvasProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  projectId?: string;
  activeTool: CanvasTool;
  isSpacePanning: boolean;
  onCanvasClick: () => void;
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onEditPage?: (pageId: string) => void;
  onToolChange: (tool: CanvasTool) => void;
  onNodeReport: (pageId: string, node: ReportedNode, intent: "pick" | "select") => void;
  onInsertAt: (pageId: string, node: ReportedNode) => void;
  onSavePageHtml: (pageId: string, html: string) => void;
}

const getDistance = (a: ScenePoint, b: ScenePoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const getCenter = (points: ScenePoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

/**
 * How far a drag has carried its item in scene pixels. The canvas can pan
 * under a held pointer, so the pan since the drag began counts as movement.
 */
const getDragDelta = (
  drag: { startClientX: number; startClientY: number; initialCamera: CameraState },
  clientX: number,
  clientY: number,
) => {
  const { camera } = useEditorStore.getState();
  const scale = scaleFromZoom(camera.zoom);
  return {
    x: (clientX - drag.startClientX - (camera.x - drag.initialCamera.x)) / scale,
    y: (clientY - drag.startClientY - (camera.y - drag.initialCamera.y)) / scale,
  };
};

/**
 * True for an event from a dialog or menu a page portals to <body>. React still
 * bubbles those through the canvas, and a pan or page drag starting there takes
 * pointer capture, which swallows the click meant for the dialog's Close button.
 */
const isFromPortal = (event: React.PointerEvent<HTMLElement>) =>
  !event.currentTarget.contains(event.target as Node);

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

const INVERSE_ZOOM = "--canvas-inverse-zoom";
// Group names keep their screen size down to 10% zoom, further than page
// titles, so an overview of many groups still reads. Only the group layer
// carries this variable, so a zoom step restyles a few labels, not every page.
const GROUP_LABEL_SCALE = "--canvas-group-label-scale";

/**
 * Pins the inverse zoom variable on every page far from the viewport. A zoom
 * step restyles each element that inherits the variable, so without this its
 * cost grows with the number of pages on the canvas instead of the number on
 * screen. The half viewport of margin covers titles and toolbars that
 * counter-scale past a page's edge, and a page is unpinned before it shows.
 */
const pinOffscreenPages = (
  camera: CameraState,
  canvas: HTMLElement,
  pageElements: Map<string, HTMLElement>,
  pageBoundsById: Record<string, PageBounds>,
) => {
  const viewport = getViewportBounds(camera, { width: canvas.clientWidth, height: canvas.clientHeight });
  const nearViewport = createBounds(
    viewport.left - viewport.width / 2,
    viewport.top - viewport.height / 2,
    viewport.right + viewport.width / 2,
    viewport.bottom + viewport.height / 2,
  );
  for (const [pageId, element] of pageElements) {
    const bounds = pageBoundsById[pageId];
    const isOffscreen = bounds !== undefined && !isBoundsIntersecting(bounds, nearViewport);
    if (isOffscreen === (element.style.getPropertyValue(INVERSE_ZOOM) !== "")) continue;
    if (isOffscreen) element.style.setProperty(INVERSE_ZOOM, "initial");
    else element.style.removeProperty(INVERSE_ZOOM);
  }
};

export default function Canvas({
  canvasRef,
  projectId,
  activeTool,
  isSpacePanning,
  onCanvasClick,
  onRenamePage,
  onDeletePage,
  onEditPage,
  onToolChange,
  onNodeReport,
  onInsertAt,
  onSavePageHtml,
}: CanvasProps) {
  const {
    canvasBackground,
    activeDevice,
    viewportSize,
    pages,
    pagePositions,
    pageStackOrder,
    pageGroups,
    pageFrameHeights,
    pageStatuses,
    agentEdits,
    focusedPageId,
    selectedNode,
    setSelectedNode,
    selectedPageIds,
    setSelectedPageIds,
    toggleSelectedPages,
    setCamera,
    panBy,
    setPagePosition,
    setPagePositions,
    ungroupPages,
    renamePageGroup,
    bringPageToFront,
    setFocusedPage,
    setPageFrameHeight,
  } = useEditorStore(
    useShallow((state) => ({
      canvasBackground: state.canvasBackground,
      activeDevice: state.activeDevice,
      viewportSize: state.viewportSize,
      pages: state.pages,
      pagePositions: state.pagePositions,
      pageStackOrder: state.pageStackOrder,
      pageGroups: state.pageGroups,
      pageFrameHeights: state.pageFrameHeights,
      pageStatuses: state.pageStatuses,
      agentEdits: state.agentEdits,
      focusedPageId: state.focusedPageId,
      selectedNode: state.selectedNode,
      setSelectedNode: state.setSelectedNode,
      selectedPageIds: state.selectedPageIds,
      setSelectedPageIds: state.setSelectedPageIds,
      toggleSelectedPages: state.toggleSelectedPages,
      setCamera: state.setCamera,
      panBy: state.panBy,
      setPagePosition: state.setPagePosition,
      setPagePositions: state.setPagePositions,
      ungroupPages: state.ungroupPages,
      renamePageGroup: state.renamePageGroup,
      bringPageToFront: state.bringPageToFront,
      setFocusedPage: state.setFocusedPage,
      setPageFrameHeight: state.setPageFrameHeight,
    })),
  );
  const isPanModeActive = activeTool === "grab" || isSpacePanning;
  const layoutStorageKey = React.useMemo(
    () => (projectId ? `wirely-wire-layout:${projectId}` : null),
    [projectId],
  );
  const pageDragStateRef = React.useRef<PointerDragState | null>(null);
  const groupDragStateRef = React.useRef<GroupDragState | null>(null);
  const panStateRef = React.useRef<CanvasPanState | null>(null);
  const edgePanRef = React.useRef<{
    clientX: number;
    clientY: number;
    redrag: (clientX: number, clientY: number) => void;
    frame: number | null;
  } | null>(null);
  const pointersRef = React.useRef<Map<number, ScenePoint>>(new Map());
  const pinchStateRef = React.useRef<PinchState | null>(null);
  const layoutSaveTimeoutRef = React.useRef<number | null>(null);
  const hasCompletedInitialLayoutRef = React.useRef(false);
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const groupLayerRef = React.useRef<HTMLDivElement>(null);
  const pageElementsRef = React.useRef(new Map<string, HTMLDivElement>());
  const [draggingPageId, setDraggingPageId] = React.useState<string | null>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const [snapGuides, setSnapGuides] = React.useState<SnapGuide[]>([]);
  // The one page running as a live iframe. It goes live on a double click, a
  // text edit, or Replay, and back to inert on Escape or a click on another page.
  const [livePageId, setLivePageId] = React.useState<string | null>(null);
  // Pages large enough on screen to draw as DOM. Every other page draws as its
  // snapshot, which is what keeps a zoomed out canvas of hundreds of pages
  // smooth. Read once the camera rests, so a gesture never renders the canvas.
  const [sharpPageIds, setSharpPageIds] = React.useState<ReadonlySet<string>>(() => new Set());
  // The element, pen, comment, and insert tools act on a page's DOM, and so
  // does dropping a project image into it, so the page under the pointer
  // builds its DOM at any zoom then. The move tool does not, or sweeping the
  // pointer across a zoomed out canvas would build every page it crosses.
  const [hoveredPageId, setHoveredPageId] = React.useState<string | null>(null);
  const isDomTool = activeTool !== "select" && activeTool !== "grab";
  React.useEffect(() => {
    if (!isDomTool) setHoveredPageId(null);
  }, [isDomTool]);
  const pendingWheelRef = React.useRef<{
    panX: number;
    panY: number;
    zoomFactor: number;
    point: ScenePoint;
    frame: number;
  } | null>(null);

  const pageLayouts = React.useMemo(() => {
    const totalPages = pages.length;

    return pages.map((page, index) => {
      const currentDevice = getCanvasFrame(page, activeDevice);
      const deviceWidth = currentDevice.width;
      const deviceHeight = currentDevice.height;
      const position = pagePositions[page.id] ?? {
        x: getDefaultPageX(index, totalPages, deviceWidth),
        y: 0,
      };
      const frameHeight = Math.max(
        deviceHeight,
        pageFrameHeights[page.id] ?? deviceHeight,
      );
      const bounds = getPageBounds({
        pageId: page.id,
        position,
        width: deviceWidth,
        height: frameHeight,
      });
      return {
        page,
        currentDevice,
        position,
        frameHeight,
        bounds,
        zIndex: pageStackOrder.indexOf(page.id) + 1,
      };
    });
  }, [
    activeDevice,
    pageFrameHeights,
    pagePositions,
    pageStackOrder,
    pages,
  ]);

  const pageBoundsById = React.useMemo(
    () =>
      pageLayouts.reduce<Record<string, PageBounds>>((accumulator, pageLayout) => {
        accumulator[pageLayout.page.id] = pageLayout.bounds;
        return accumulator;
      }, {}),
    [pageLayouts],
  );
  const pageBoundsRef = React.useRef(pageBoundsById);

  const updateSharpPages = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ids = getSharpPageIds({
      camera: useEditorStore.getState().camera,
      viewport: { width: canvas.clientWidth, height: canvas.clientHeight },
      pageBounds: Object.values(pageBoundsRef.current),
      pixelRatio: window.devicePixelRatio || 1,
    });
    setSharpPageIds((previous) =>
      ids.length === previous.size && ids.every((id) => previous.has(id)) ? previous : new Set(ids),
    );
  }, [canvasRef]);

  const groupFrames = React.useMemo(
    () =>
      pageGroups.flatMap((group) => {
        const bounds = unionBounds(
          group.pageIds.flatMap((pageId) => pageBoundsById[pageId] ?? []),
        );
        return bounds ? [{ group, bounds }] : [];
      }),
    [pageBoundsById, pageGroups],
  );

  React.useEffect(() => {
    const assigned = placeMissingPages(
      pages.map((page) => ({
        id: page.id,
        width: getCanvasFrame(page, activeDevice).width,
      })),
      pagePositions,
    );
    for (const [pageId, x] of Object.entries(assigned)) {
      setPagePosition(pageId, { x, y: 0 });
    }
  }, [activeDevice, pagePositions, pages, setPagePosition]);

  React.useEffect(() => {
    for (const page of pages) {
      if (pageStackOrder.includes(page.id)) continue;
      bringPageToFront(page.id);
    }
  }, [bringPageToFront, pageStackOrder, pages]);

  React.useEffect(
    () => () => {
      if (layoutSaveTimeoutRef.current !== null) {
        window.clearTimeout(layoutSaveTimeoutRef.current);
      }
    },
    [],
  );

  // Layout lives in local storage only, so it does not count as a pending
  // save. Counting it would hold back agent edits polled from the server. The
  // write waits for the layout to sit still and then reads the store, so a
  // burst of camera frames and page moves becomes one write.
  const scheduleLayoutSave = React.useCallback(() => {
    if (!layoutStorageKey) return;

    const { pages, pagePositions, pageStackOrder } = useEditorStore.getState();
    const hasAllPositions = pages.every((page) => pagePositions[page.id]);
    const hasAllStackEntries = pages.every((page) => pageStackOrder.includes(page.id));
    if (!hasAllPositions || !hasAllStackEntries) return;

    if (!hasCompletedInitialLayoutRef.current) {
      hasCompletedInitialLayoutRef.current = true;
      return;
    }

    if (layoutSaveTimeoutRef.current !== null) {
      window.clearTimeout(layoutSaveTimeoutRef.current);
    }
    layoutSaveTimeoutRef.current = window.setTimeout(() => {
      layoutSaveTimeoutRef.current = null;
      const {
        camera,
        pagePositions,
        pageStackOrder,
        pageGroups,
        pageFrameHeights,
        arrangedAt,
        arrangement,
      } = useEditorStore.getState();
      try {
        window.localStorage.setItem(
          layoutStorageKey,
          JSON.stringify({
            version: 2,
            camera,
            pagePositions,
            pageStackOrder,
            pageGroups,
            pageFrameHeights,
            arrangedAt,
            arrangement,
          }),
        );
      } catch (error) {
        logger.error("wire_layout_persist_failed", { error });
      }
    }, LAYOUT_SAVE_IDLE_MS);
  }, [layoutStorageKey]);

  React.useEffect(() => {
    scheduleLayoutSave();
  }, [scheduleLayoutSave, pageFrameHeights, pageGroups, pagePositions, pageStackOrder, pages]);

  // Pan and zoom write the camera straight onto the scene element. Rendering
  // the canvas for it would walk every page on every frame of a gesture.
  //
  // The scene is its own GPU layer only while the camera moves. Chrome rasters
  // a `will-change: transform` layer at the scale it had when promoted and
  // keeps that scale while the transform changes. Zoomed out far past it, a
  // canvas of many pages asks for many times the tiles the screen shows. Past
  // the tile budget Chrome drops tiles across the whole window, and the
  // sidebars and toolbar flicker blank. So the hint drops when the camera
  // rests, and mid-zoom it drops for one frame whenever the zoom drifts past
  // MAX_LAYER_SCALE_DRIFT, which rasters the scene again at its real scale.
  React.useLayoutEffect(() => {
    let layerTimer: number | undefined;
    let sharpenTimer: number | undefined;
    // The zoom the layer was rastered at, or null while the scene has no layer.
    let layerZoom: number | null = null;
    // Set from a release until a frame has rendered without the layer. Adding
    // the hint back before then would keep the old raster.
    let releaseFrame: number | undefined;
    const releaseLayer = (scene: HTMLElement) => {
      scene.style.willChange = "";
      layerZoom = null;
    };
    const holdLayer = (scene: HTMLElement, zoom: number) => {
      window.clearTimeout(layerTimer);
      layerTimer = window.setTimeout(() => releaseLayer(scene), CAMERA_LAYER_IDLE_MS);
      if (releaseFrame !== undefined) return;
      if (layerZoom === null) {
        scene.style.willChange = "transform";
        layerZoom = zoom;
        return;
      }
      if (Math.max(zoom / layerZoom, layerZoom / zoom) < MAX_LAYER_SCALE_DRIFT) return;
      releaseLayer(scene);
      // Two frames, since a release made outside a frame callback renders in
      // the frame the first callback runs in.
      releaseFrame = window.requestAnimationFrame(() => {
        releaseFrame = window.requestAnimationFrame(() => {
          releaseFrame = undefined;
        });
      });
    };
    const applyCamera = (camera: CameraState, previous?: CameraState) => {
      const scene = sceneRef.current;
      const canvas = canvasRef.current;
      if (!scene || !canvas) return;
      // Before the writes below, so reading the canvas size forces no restyle.
      pinOffscreenPages(camera, canvas, pageElementsRef.current, pageBoundsRef.current);
      scene.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${scaleFromZoom(camera.zoom)})`;
      // Page titles and toolbars counter-scale off this variable. Setting it
      // restyles each of them, so a pan, which keeps the zoom, leaves it alone.
      if (camera.zoom !== previous?.zoom) {
        scene.style.setProperty(INVERSE_ZOOM, String(100 / Math.max(20, camera.zoom)));
        groupLayerRef.current?.style.setProperty(
          GROUP_LABEL_SCALE,
          String(100 / Math.max(10, camera.zoom)),
        );
      }
    };
    applyCamera(useEditorStore.getState().camera);
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.camera === previous.camera) return;
      if (sceneRef.current) holdLayer(sceneRef.current, state.camera.zoom);
      applyCamera(state.camera, previous.camera);
      scheduleLayoutSave();
      window.clearTimeout(sharpenTimer);
      sharpenTimer = window.setTimeout(updateSharpPages, SHARPEN_IDLE_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(layerTimer);
      window.clearTimeout(sharpenTimer);
      if (releaseFrame !== undefined) window.cancelAnimationFrame(releaseFrame);
    };
  }, [canvasRef, scheduleLayoutSave, updateSharpPages]);

  // A page that moves, appears, or comes into view as the canvas resizes needs
  // the same checks the camera runs.
  React.useLayoutEffect(() => {
    pageBoundsRef.current = pageBoundsById;
    const canvas = canvasRef.current;
    if (canvas) pinOffscreenPages(useEditorStore.getState().camera, canvas, pageElementsRef.current, pageBoundsById);
    updateSharpPages();
  }, [canvasRef, pageBoundsById, updateSharpPages]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      pinOffscreenPages(useEditorStore.getState().camera, canvas, pageElementsRef.current, pageBoundsRef.current);
      updateSharpPages();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, updateSharpPages]);

  const handleWheel = React.useCallback(
    (event: WheelEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-scroll-lock="modal"]')
      ) {
        return;
      }

      event.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      // A trackpad fires several wheel events per frame. Folding them into one
      // camera update per animation frame keeps it to one scene write a frame.
      const pending =
        pendingWheelRef.current ??
        (pendingWheelRef.current = {
          panX: 0,
          panY: 0,
          zoomFactor: 1,
          point: { x: 0, y: 0 },
          frame: 0,
        });
      pending.point = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      if (event.ctrlKey || event.metaKey) {
        const isLikelyMouseWheel =
          event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
          Math.abs(event.deltaY) >= 40;
        const sensitivity = isLikelyMouseWheel ? 0.0025 : 0.01;
        pending.zoomFactor *= Math.exp(-event.deltaY * sensitivity);
      } else {
        pending.panX -= event.deltaX;
        pending.panY -= event.deltaY;
      }

      if (pending.frame) return;
      pending.frame = window.requestAnimationFrame(() => {
        const { panX, panY, zoomFactor, point } = pending;
        pendingWheelRef.current = null;
        // The camera is read fresh rather than closed over, so this callback
        // stays stable and the listener subscribes once.
        const { camera, viewportSize } = useEditorStore.getState();
        const zoomed =
          zoomFactor === 1
            ? camera
            : zoomAtViewportPoint({
                camera,
                viewportPoint: point,
                viewport: viewportSize,
                nextZoom: camera.zoom * zoomFactor,
              });
        setCamera({ ...zoomed, x: zoomed.x + panX, y: zoomed.y + panY });
      });
    },
    [canvasRef, setCamera],
  );

  React.useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      return;
    }

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
    };

    canvasElement.addEventListener("wheel", handleWheel, { passive: false });
    canvasElement.addEventListener("gesturestart", preventGestureDefault);
    canvasElement.addEventListener("gesturechange", preventGestureDefault);
    canvasElement.addEventListener("gestureend", preventGestureDefault);

    return () => {
      if (pendingWheelRef.current?.frame) {
        window.cancelAnimationFrame(pendingWheelRef.current.frame);
        pendingWheelRef.current = null;
      }
      canvasElement.removeEventListener("wheel", handleWheel);
      canvasElement.removeEventListener("gesturestart", preventGestureDefault);
      canvasElement.removeEventListener("gesturechange", preventGestureDefault);
      canvasElement.removeEventListener("gestureend", preventGestureDefault);
    };
  }, [canvasRef, handleWheel]);

  const handleCanvasPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isFromPortal(event) || isEditableTarget(event.target)) {
        return;
      }

      pointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointersRef.current.size === 2) {
        const points = Array.from(pointersRef.current.values());
        pinchStateRef.current = {
          lastCenter: getCenter(points),
          initialDistance: getDistance(points[0], points[1]),
        };
      }

      const shouldPan =
        event.button === 1 || (event.button === 0 && isPanModeActive);
      if (!shouldPan) {
        return;
      }

      stopCameraGlide();
      panStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialCamera: useEditorStore.getState().camera,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [isPanModeActive],
  );

  const handleCanvasPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      }

      if (pointersRef.current.size >= 2 && pinchStateRef.current && canvasRef.current) {
        const points = Array.from(pointersRef.current.values());
        const currentCenter = getCenter(points);
        const currentDistance = getDistance(points[0], points[1]);
        const rect = canvasRef.current.getBoundingClientRect();
        const currentCamera = useEditorStore.getState().camera;
        const zoomFactor =
          pinchStateRef.current.initialDistance > 0
            ? currentDistance / pinchStateRef.current.initialDistance
            : 1;
        const nextZoom = clampZoom(currentCamera.zoom * zoomFactor);
        const nextCamera = zoomAtViewportPoint({
          camera: currentCamera,
          viewportPoint: {
            x: currentCenter.x - rect.left,
            y: currentCenter.y - rect.top,
          },
          viewport: viewportSize,
          nextZoom,
        });

        nextCamera.x += currentCenter.x - pinchStateRef.current.lastCenter.x;
        nextCamera.y += currentCenter.y - pinchStateRef.current.lastCenter.y;
        setCamera(nextCamera);
        pinchStateRef.current = {
          lastCenter: currentCenter,
          initialDistance: currentDistance,
        };
        event.preventDefault();
        return;
      }

      const panState = panStateRef.current;
      if (!panState || panState.pointerId !== event.pointerId) {
        return;
      }

      setCamera({
        ...panState.initialCamera,
        x: panState.initialCamera.x + (event.clientX - panState.startClientX),
        y: panState.initialCamera.y + (event.clientY - panState.startClientY),
      });
      event.preventDefault();
    },
    [canvasRef, setCamera, viewportSize],
  );

  const stopCanvasInteraction = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) {
        pinchStateRef.current = null;
      }

      const panState = panStateRef.current;
      if (panState && panState.pointerId === event.pointerId) {
        panStateRef.current = null;
        setIsPanning(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        event.preventDefault();
      }
    },
    [],
  );

  // Capture phase, so shift-click toggles the selection before the page's own
  // focus handler replaces it with just this page. Any press on another page
  // sends the live page back to inert.
  const handlePagePointerDownCapture = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (isFromPortal(event)) return;
      setLivePageId((current) => (current === pageId ? current : null));
      if (!event.shiftKey || activeTool !== "select" || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setFocusedPage(pageId);
      toggleSelectedPages([pageId]);
    },
    [activeTool, setFocusedPage, toggleSelectedPages],
  );

  // While a page or group is held near the canvas edge, pan one step a frame
  // and move the held item with the pan, so it can be dropped beyond the view.
  const panAtEdge = React.useCallback(
    (clientX: number, clientY: number, redrag: (clientX: number, clientY: number) => void) => {
      const state = edgePanRef.current ?? { clientX, clientY, redrag, frame: null };
      Object.assign(state, { clientX, clientY, redrag });
      edgePanRef.current = state;
      if (state.frame !== null) return;

      const step = () => {
        const current = edgePanRef.current;
        const canvas = canvasRef.current;
        if (!current || !canvas) return;
        current.frame = null;
        const velocity = getEdgePanVelocity(
          { x: current.clientX, y: current.clientY },
          canvas.getBoundingClientRect(),
        );
        if (velocity.x === 0 && velocity.y === 0) return;
        panBy({ x: -velocity.x, y: -velocity.y });
        current.redrag(current.clientX, current.clientY);
        current.frame = window.requestAnimationFrame(step);
      };
      state.frame = window.requestAnimationFrame(step);
    },
    [canvasRef, panBy],
  );

  const stopEdgePan = React.useCallback(() => {
    const frame = edgePanRef.current?.frame;
    if (frame != null) window.cancelAnimationFrame(frame);
    edgePanRef.current = null;
  }, []);

  React.useEffect(() => stopEdgePan, [stopEdgePan]);

  const handlePagePointerDown = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        activeTool !== "select" ||
        isSpacePanning ||
        event.button !== 0 ||
        event.pointerType === "touch" ||
        isFromPortal(event)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setFocusedPage(pageId);
      if (!selectedPageIds.includes(pageId)) setSelectedPageIds([pageId]);
      bringPageToFront(pageId);

      // Pressing a page in a multi-page selection drags the whole selection.
      const movingPageIds = selectedPageIds.includes(pageId) ? selectedPageIds : [pageId];
      const startOf = (id: string) =>
        pageBoundsById[id] ? { x: pageBoundsById[id].left, y: pageBoundsById[id].top } : null;
      stopCameraGlide();
      pageDragStateRef.current = {
        pageId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialPosition: startOf(pageId) ?? { x: 0, y: 0 },
        initialPositions: Object.fromEntries(
          movingPageIds.flatMap((id) => {
            const start = startOf(id);
            return start ? [[id, start]] : [];
          }),
        ),
        initialCamera: useEditorStore.getState().camera,
        hasMoved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeTool,
      bringPageToFront,
      isSpacePanning,
      pageBoundsById,
      selectedPageIds,
      setFocusedPage,
      setSelectedPageIds,
    ],
  );

  const handlePagePointerMove = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = pageDragStateRef.current;
      if (!dragState) return;
      if (dragState.pageId !== pageId || dragState.pointerId !== event.pointerId) {
        return;
      }

      const viewportDeltaX = event.clientX - dragState.startClientX;
      const viewportDeltaY = event.clientY - dragState.startClientY;
      const movedDistance = Math.hypot(viewportDeltaX, viewportDeltaY);

      if (!dragState.hasMoved && movedDistance < DRAG_START_THRESHOLD_PX) {
        return;
      }

      dragState.hasMoved = true;
      setDraggingPageId(pageId);

      const draggedLayout = pageLayouts.find(
        (layout) => layout.page.id === pageId,
      );
      const isSnapDisabled = event.metaKey || event.ctrlKey;
      const movePage = (clientX: number, clientY: number) => {
        const delta = getDragDelta(dragState, clientX, clientY);
        const snapped = getSnappedPagePosition({
          movingPageId: pageId,
          position: {
            x: dragState.initialPosition.x + delta.x,
            y: dragState.initialPosition.y + delta.y,
          },
          width:
            draggedLayout?.currentDevice.width ??
            pageBoundsById[pageId]?.width ??
            getPageFrameWidth(resolvePageFrameDevice(undefined, activeDevice)),
          height:
            pageBoundsById[pageId]?.height ??
            draggedLayout?.frameHeight ??
            0,
          // Pages moving along would otherwise snap to where they started.
          otherPages: pageLayouts
            .map((pageLayout) => pageLayout.bounds)
            .filter((bounds) => !(bounds.pageId in dragState.initialPositions)),
          scale: scaleFromZoom(useEditorStore.getState().camera.zoom),
          disabled: isSnapDisabled,
        });

        setPagePositions(movePagesWith(dragState.initialPositions, pageId, snapped.position));
        setSnapGuides(snapped.guides);
      };

      movePage(event.clientX, event.clientY);
      panAtEdge(event.clientX, event.clientY, movePage);
      event.preventDefault();
    },
    [
      activeDevice,
      pageBoundsById,
      pageLayouts,
      panAtEdge,
      setPagePositions,
    ],
  );

  const stopPageDrag = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = pageDragStateRef.current;
      if (!dragState) return;
      if (dragState.pageId !== pageId || dragState.pointerId !== event.pointerId) {
        return;
      }

      pageDragStateRef.current = null;
      stopEdgePan();
      setDraggingPageId(null);
      setSnapGuides([]);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    },
    [stopEdgePan],
  );

  const handleMeasuredHeightChange = React.useCallback(
    (pageId: string, height: number) => {
      setPageFrameHeight(pageId, height);
    },
    [setPageFrameHeight],
  );

  const handlePageFocus = React.useCallback(
    (pageId: string) => {
      setFocusedPage(pageId);
      if (!useEditorStore.getState().selectedPageIds.includes(pageId)) setSelectedPageIds([pageId]);
    },
    [setFocusedPage, setSelectedPageIds],
  );

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedPageIds([]);
        if (!isEditableTarget(event.target)) {
          setSelectedNode(null);
          setLivePageId(null);
        }
      }
      // Ctrl+Shift+G ungroups. Groups made before the group tool was removed
      // still need a way out.
      if (event.key.toLowerCase() !== "g" || !(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (isEditableTarget(event.target) || selectedPageIds.length === 0) return;
      event.preventDefault();
      for (const group of pageGroups) {
        if (group.pageIds.some((pageId) => selectedPageIds.includes(pageId))) {
          ungroupPages(group.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pageGroups, selectedPageIds, setSelectedNode, setSelectedPageIds, ungroupPages]);

  // Shift-click adds the group's pages to the selection or takes them out.
  // Pressing a group already inside a larger selection drags the whole
  // selection, the way pressing a selected page does.
  const handleGroupPointerDown = React.useCallback(
    (groupPageIds: string[]) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool !== "select" || isSpacePanning || event.button !== 0) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        toggleSelectedPages(groupPageIds);
        return;
      }
      const isInSelection = groupPageIds.every((pageId) => selectedPageIds.includes(pageId));
      const pageIds = isInSelection ? selectedPageIds : groupPageIds;
      stopCameraGlide();
      groupDragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialCamera: useEditorStore.getState().camera,
        initialPositions: Object.fromEntries(
          pageIds.flatMap((pageId) => {
            const bounds = pageBoundsById[pageId];
            return bounds ? [[pageId, { x: bounds.left, y: bounds.top }]] : [];
          }),
        ),
      };
      setSelectedPageIds(pageIds);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeTool,
      isSpacePanning,
      pageBoundsById,
      selectedPageIds,
      setSelectedPageIds,
      toggleSelectedPages,
    ],
  );

  const handleGroupPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = groupDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const moveGroup = (clientX: number, clientY: number) => {
        const delta = getDragDelta(dragState, clientX, clientY);
        setPagePositions(
          Object.fromEntries(
            Object.entries(dragState.initialPositions).map(([pageId, position]) => [
              pageId,
              { x: position.x + delta.x, y: position.y + delta.y },
            ]),
          ),
        );
      };
      moveGroup(event.clientX, event.clientY);
      panAtEdge(event.clientX, event.clientY, moveGroup);
    },
    [panAtEdge, setPagePositions],
  );

  const stopGroupDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (groupDragStateRef.current?.pointerId !== event.pointerId) return;
    groupDragStateRef.current = null;
    stopEdgePan();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [stopEdgePan]);

  // Not from the pen, comment, or insert tools, where a double click means
  // something on the page itself.
  const handlePageDoubleClick = React.useCallback(
    (pageId: string) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (activeTool !== "select" && activeTool !== "element") return;
      if (!event.currentTarget.contains(event.target as Node) || isEditableTarget(event.target)) return;
      setLivePageId(pageId);
    },
    [activeTool],
  );

  const handlePageContextEdit = React.useCallback(
    (pageId: string) => {
      setFocusedPage(pageId);
      onEditPage?.(pageId);
    },
    [onEditPage, setFocusedPage],
  );

  return (
    <div
      ref={canvasRef}
      className={`relative h-full w-full overflow-hidden select-none ${
        isPanModeActive ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      onClick={() => {
        setSelectedPageIds([]);
        setSelectedNode(null);
        onCanvasClick();
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={stopCanvasInteraction}
      onPointerCancel={stopCanvasInteraction}
      // A project image dropped on empty canvas becomes its own page there.
      // Drops on a page are taken by the page.
      onDragOver={(event) => {
        if (!projectId || !event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        const asset = parseAssetDrag(event.dataTransfer.getData(ASSET_DRAG_TYPE));
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!asset || !projectId || !rect) return;
        event.preventDefault();
        const { camera, viewportSize } = useEditorStore.getState();
        const center = viewportToScene(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          camera,
          viewportSize,
        );
        void createAssetPage(projectId, asset, center);
      }}
      style={CANVAS_BACKGROUND_STYLES[canvasBackground]}
    >
      <div className="pointer-events-none absolute inset-0 canvas-dots" />
      <div
        ref={sceneRef}
        className="absolute"
        style={{
          // The camera subscription above writes the transform and the zoom
          // variable, so no render ever has to.
          transformOrigin: "0 0",
          left: "50%",
          top: `${CANVAS_TOP_OFFSET}px`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          {/* Static, so the frames still position against the scene. */}
          <div ref={groupLayerRef}>
            {groupFrames.map(({ group, bounds }) => (
              <PageGroupFrame
                key={group.id}
                name={group.name}
                left={bounds.left - GROUP_FRAME_PADDING}
                top={bounds.top - GROUP_FRAME_PADDING}
                width={bounds.width + GROUP_FRAME_PADDING * 2}
                // Page bounds measure the design only, so the frame adds the
                // title row each page draws above its design.
                height={bounds.height + PAGE_FRAME_TOP + GROUP_FRAME_PADDING * 2}
                isSelected={group.pageIds.every((pageId) => selectedPageIds.includes(pageId))}
                onRename={(name) => renamePageGroup(group.id, name)}
                onUngroup={() => ungroupPages(group.id)}
                onPointerDown={handleGroupPointerDown(group.pageIds)}
                onPointerMove={handleGroupPointerMove}
                onPointerUp={stopGroupDrag}
              />
            ))}
          </div>
          {pageLayouts.map((pageLayout) => {
            const renderMode: PageRenderMode = livePageId === pageLayout.page.id ? "live" : "inert";

            return (
              <div
                key={pageLayout.page.id}
                ref={(element) => {
                  if (!element) return;
                  pageElementsRef.current.set(pageLayout.page.id, element);
                  return () => {
                    pageElementsRef.current.delete(pageLayout.page.id);
                  };
                }}
                className={`absolute ${
                  activeTool === "select" && !isSpacePanning
                    ? draggingPageId === pageLayout.page.id
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : ""
                }`}
                style={{
                  left: `${pageLayout.position.x}px`,
                  top: `${pageLayout.position.y}px`,
                  zIndex: pageLayout.zIndex,
                }}
                onPointerDownCapture={handlePagePointerDownCapture(pageLayout.page.id)}
                onPointerDown={handlePagePointerDown(pageLayout.page.id)}
                onPointerMove={(event) => {
                  // A move rather than an enter, so a tool picked from the
                  // keyboard with the pointer already over a page counts too.
                  if (isDomTool && hoveredPageId !== pageLayout.page.id) setHoveredPageId(pageLayout.page.id);
                  handlePagePointerMove(pageLayout.page.id)(event);
                }}
                onDragEnter={(event) => {
                  if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) setHoveredPageId(pageLayout.page.id);
                }}
                onPointerUp={stopPageDrag(pageLayout.page.id)}
                onPointerCancel={stopPageDrag(pageLayout.page.id)}
                onDoubleClick={handlePageDoubleClick(pageLayout.page.id)}
              >
                <PageRenderer
                  page={pageLayout.page}
                  onRenamePage={onRenamePage}
                  onDeletePage={onDeletePage}
                  onEditPage={handlePageContextEdit}
                  onFocusPage={handlePageFocus}
                  onMeasuredHeightChange={handleMeasuredHeightChange}
                  currentDevice={pageLayout.currentDevice}
                  projectId={projectId}
                  status={pageStatuses[pageLayout.page.id] ?? null}
                  agentEdit={agentEdits[pageLayout.page.id] ?? null}
                  isOnlyPage={pages.length <= 1}
                  isFocused={focusedPageId === pageLayout.page.id}
                  isSelected={selectedPageIds.includes(pageLayout.page.id)}
                  frameHeight={pageLayout.frameHeight}
                  renderMode={renderMode}
                  // The page being worked on keeps its DOM at any zoom, since
                  // picking, selection boxes, and the agent cursor read it.
                  preferSnapshot={
                    !sharpPageIds.has(pageLayout.page.id) &&
                    focusedPageId !== pageLayout.page.id &&
                    hoveredPageId !== pageLayout.page.id &&
                    renderMode !== "live" &&
                    selectedNode?.pageId !== pageLayout.page.id
                  }
                  onLiveChange={setLivePageId}
                  isElementMode={activeTool === "element" && !isSpacePanning}
                  isPenMode={activeTool === "pen" && !isSpacePanning}
                  isCommentMode={activeTool === "comment" && !isSpacePanning}
                  onSavePageHtml={onSavePageHtml}
                  isMoveMode={activeTool === "select" && !isSpacePanning}
                  insertKind={isInsertTool(activeTool) && !isSpacePanning ? activeTool : null}
                  onInsertAt={onInsertAt}
                  selectedNodeId={
                    selectedNode?.pageId === pageLayout.page.id ? selectedNode.nodeId : null
                  }
                  onNodeReport={onNodeReport}
                />
              </div>
            );
          })}

          {/* Pins sit in their own layer above every page, so a page stacked on
              top of another never hides that page's comments. */}
          {projectId
            ? pageLayouts.map((pageLayout) => (
                <div
                  key={`comments-${pageLayout.page.id}`}
                  className="absolute"
                  style={{
                    left: `${pageLayout.position.x}px`,
                    top: `${pageLayout.position.y + PAGE_FRAME_TOP}px`,
                    zIndex: pageLayouts.length + 1,
                  }}
                >
                  <CanvasCommentPins pageId={pageLayout.page.id} projectId={projectId} />
                </div>
              ))
            : null}

          {snapGuides.length > 0 ? <SnapGuides guides={snapGuides} /> : null}
        </div>
      </div>

      <CanvasToolbar activeTool={activeTool} onToolChange={onToolChange} />
    </div>
  );
}

interface PageGroupFrameProps {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isSelected: boolean;
  onRename: (name: string) => void;
  onUngroup: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * The frame behind a group's pages. It sizes itself from its pages, so moving a
 * page stretches it. Dragging the frame or its title moves every page in the
 * group; double-click the name to rename it.
 */
function PageGroupFrame({
  name,
  left,
  top,
  width,
  height,
  isSelected,
  onRename,
  onUngroup,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: PageGroupFrameProps) {
  const [isRenaming, setIsRenaming] = React.useState(false);

  return (
    <div
      className={`group/frame absolute cursor-grab rounded-2xl border bg-foreground/[0.07] active:cursor-grabbing ${
        isSelected ? "border-sky-500" : "border-foreground/20"
      }`}
      style={{
        left,
        top,
        width,
        height,
        zIndex: 0,
        borderWidth: "calc(1px * var(--canvas-inverse-zoom, 1))",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute bottom-full left-0 origin-bottom-left pb-2 text-[color:var(--canvas-label-strong,var(--foreground))]"
        // Rows leave room for the name at its largest in ARRANGEMENT_ROW_GAP.
        // Groups side by side get no such room, so the chip stops at its
        // frame's width and a long name truncates, like a Figma section's.
        // A tiny frame still leaves the chip 96px, so its name never vanishes,
        // and renaming lifts the cap so the field stays usable.
        style={{
          transform: `scale(var(${GROUP_LABEL_SCALE}, 1))`,
          maxWidth: isRenaming
            ? undefined
            : `max(96px, calc(${width}px / var(${GROUP_LABEL_SCALE}, 1)))`,
        }}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {/* A filled chip, like a Figma section label, so the name reads as the
            frame's title rather than loose text on the canvas. */}
        <div className="flex max-w-full items-center gap-1 rounded-lg border border-foreground/20 bg-foreground/[0.12] px-2.5 py-1">
          {isRenaming ? (
            <input
              autoFocus
              defaultValue={name}
              aria-label="Group name"
              className="h-6 w-40 min-w-0 rounded border border-sky-500 bg-background px-1.5 text-sm text-foreground outline-none"
              onBlur={(event) => {
                onRename(event.currentTarget.value);
                setIsRenaming(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setIsRenaming(false);
              }}
            />
          ) : (
            <span className="truncate text-sm font-semibold" data-tip={name}>
              {name}
            </span>
          )}
          {/* Collapsed until the group is hovered or selected, or the button
              takes keyboard focus, so it never crowds the name. It collapses
              rather than hides, so it stays in the tab order. */}
          <button
            type="button"
            onClick={onUngroup}
            aria-label={`Ungroup ${name}`}
            data-tip="Ungroup (Ctrl+Shift+G)"
            className={`shrink-0 overflow-hidden rounded text-[color:var(--canvas-label,var(--muted-foreground))] hover:bg-foreground/10 ${
              isSelected
                ? "-mr-1.5 max-w-6 p-0.5"
                : "max-w-0 p-0 opacity-0 group-hover/frame:-mr-1.5 group-hover/frame:max-w-6 group-hover/frame:p-0.5 group-hover/frame:opacity-100 focus-visible:-mr-1.5 focus-visible:max-w-6 focus-visible:p-0.5 focus-visible:opacity-100"
            }`}
          >
            <Ungroup className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The snap lines of a drag in progress, one screen pixel thick at any zoom.
 * It reads the zoom itself because the canvas does not render on camera
 * changes, and it mounts only mid-drag, so a zoom renders nothing else.
 */
function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  const thickness = 1 / scaleFromZoom(useEditorStore((state) => state.camera.zoom));
  return guides.map((guide, index) =>
    guide.orientation === "vertical" ? (
      <div
        key={`vertical-${index}`}
        className="absolute bg-rose-500/90"
        style={{
          left: `${guide.position}px`,
          top: `${guide.start}px`,
          width: `${thickness}px`,
          height: `${guide.end - guide.start}px`,
        }}
      />
    ) : (
      <div
        key={`horizontal-${index}`}
        className="absolute bg-rose-500/90"
        style={{
          left: `${guide.start}px`,
          top: `${guide.position}px`,
          width: `${guide.end - guide.start}px`,
          height: `${thickness}px`,
        }}
      />
    ),
  );
}
