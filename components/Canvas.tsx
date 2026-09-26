"use client";

import React from "react";
import { Ungroup } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { logger } from "@/lib/logger";
import { type CanvasBackground, useEditorStore } from "@/store/useEditorStore";
import CanvasToolbar from "./CanvasToolbar";
import PageRenderer from "./PageRenderer";
import {
  type CameraState,
  type PageBounds,
  type PageRenderMode,
  type ScenePoint,
  type SnapGuide,
  CANVAS_TOP_OFFSET,
  clampZoom,
  getDefaultPageX,
  getPageBounds,
  getPageFrameHeight,
  getPageFrameWidth,
  getPageRenderMode,
  getSnappedPagePosition,
  getViewportBounds,
  placeMissingPages,
  unionBounds,
  resolvePageFrameDevice,
  scaleFromZoom,
  zoomAtViewportPoint,
} from "@/lib/canvasScene";

const DEVICE_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
} as const;

// Frame labels sit on the canvas, so light backgrounds swap them to dark text.
const CANVAS_BACKGROUND_STYLES: Record<CanvasBackground, React.CSSProperties> = {
  dark: {},
  gray: {
    backgroundColor: "#8e9097",
    ["--canvas-label" as string]: "#26282e",
    ["--canvas-label-strong" as string]: "#0e1014",
  },
  light: {
    backgroundColor: "#eceef2",
    ["--canvas-label" as string]: "#6b7180",
    ["--canvas-label-strong" as string]: "#0e1014",
  },
};

const DRAG_START_THRESHOLD_PX = 4;
// Each live page is a sandboxed iframe that parses its HTML, runs its CDN
// scripts, and measures itself on the main thread. Mounting them one at a time
// lets the canvas paint and respond to input on first load instead of freezing
// until every frame has loaded.
const LIVE_PAGE_MOUNT_INTERVAL_MS = 120;
const LAYOUT_SAVE_IDLE_MS = 700;
const LAYOUT_SAVE_ICON_MS = 350;
// Scene pixels between a group's frame and its pages. The top leaves room for
// the 50px page title row.
const GROUP_PADDING = 32;
const GROUP_TITLE_ROW = 50;

interface PointerDragState {
  pageId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialPosition: ScenePoint;
  hasMoved: boolean;
}

interface GroupDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
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
  activeTool: "select" | "grab";
  isSpacePanning: boolean;
  onCanvasClick: () => void;
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onEditPage?: (pageId: string) => void;
  onToolChange: (tool: "select" | "grab") => void;
}

const getDistance = (a: ScenePoint, b: ScenePoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const getCenter = (points: ScenePoint[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

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
}: CanvasProps) {
  const {
    camera,
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
    beginSaving,
    endSaving,
    setCamera,
    setPagePosition,
    setPagePositions,
    groupPages,
    ungroupPages,
    renamePageGroup,
    bringPageToFront,
    setFocusedPage,
    setPageFrameHeight,
  } = useEditorStore(
    useShallow((state) => ({
      camera: state.camera,
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
      beginSaving: state.beginSaving,
      endSaving: state.endSaving,
      setCamera: state.setCamera,
      setPagePosition: state.setPagePosition,
      setPagePositions: state.setPagePositions,
      groupPages: state.groupPages,
      ungroupPages: state.ungroupPages,
      renamePageGroup: state.renamePageGroup,
      bringPageToFront: state.bringPageToFront,
      setFocusedPage: state.setFocusedPage,
      setPageFrameHeight: state.setPageFrameHeight,
    })),
  );
  const scale = scaleFromZoom(camera.zoom);
  const isPanModeActive = activeTool === "grab" || isSpacePanning;
  const layoutStorageKey = React.useMemo(
    () => (projectId ? `wirely-wire-layout:${projectId}` : null),
    [projectId],
  );
  const pageDragStateRef = React.useRef<PointerDragState | null>(null);
  const groupDragStateRef = React.useRef<GroupDragState | null>(null);
  const panStateRef = React.useRef<CanvasPanState | null>(null);
  const pointersRef = React.useRef<Map<number, ScenePoint>>(new Map());
  const pinchStateRef = React.useRef<PinchState | null>(null);
  const layoutSaveTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveIndicatorTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveActiveRef = React.useRef(false);
  const hasCompletedInitialLayoutRef = React.useRef(false);
  const [draggingPageId, setDraggingPageId] = React.useState<string | null>(null);
  // Separate from the store's focused page, which always points at some page so
  // the chat knows what to edit. This one exists only while the user has pages
  // clicked, drives the size badge, and is what Cmd+G groups.
  const [selectedPageIds, setSelectedPageIds] = React.useState<string[]>([]);
  const [isPanning, setIsPanning] = React.useState(false);
  const [snapGuides, setSnapGuides] = React.useState<SnapGuide[]>([]);
  const [mountedPageIds, setMountedPageIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
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
      const device = resolvePageFrameDevice(page.deviceType, activeDevice);
      const deviceWidth = getPageFrameWidth(device);
      const deviceHeight = getPageFrameHeight(device);
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
        // Stable identity per layout, so the memoized PageRenderer does not
        // re-render on camera-only changes like pan and zoom.
        currentDevice: {
          width: deviceWidth,
          height: deviceHeight,
          label: DEVICE_LABELS[device],
        },
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

  const viewportBounds = React.useMemo(
    () => getViewportBounds(camera, viewportSize),
    [camera, viewportSize],
  );

  const pageRenderModes = React.useMemo(
    () =>
      new Map(
        pageLayouts.map((pageLayout) => [
          pageLayout.page.id,
          getPageRenderMode(pageLayout.bounds, viewportBounds),
        ]),
      ),
    [pageLayouts, viewportBounds],
  );

  // Admits the next in-view page, nearest the viewport centre first. Any camera
  // move restarts the timer, so frames mount once the canvas settles rather
  // than mid-gesture. A mounted page stays mounted.
  React.useEffect(() => {
    const centerX = (viewportBounds.left + viewportBounds.right) / 2;
    const centerY = (viewportBounds.top + viewportBounds.bottom) / 2;
    let next: { id: string; distance: number } | null = null;
    for (const pageLayout of pageLayouts) {
      const pageId = pageLayout.page.id;
      if (mountedPageIds.has(pageId) || pageRenderModes.get(pageId) !== "live") continue;
      const distance = Math.hypot(
        pageLayout.bounds.centerX - centerX,
        pageLayout.bounds.centerY - centerY,
      );
      if (!next || distance < next.distance) next = { id: pageId, distance };
    }
    if (!next) return;

    const pageId = next.id;
    const timeoutId = window.setTimeout(
      () => setMountedPageIds((current) => new Set(current).add(pageId)),
      mountedPageIds.size === 0 ? 0 : LIVE_PAGE_MOUNT_INTERVAL_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [mountedPageIds, pageLayouts, pageRenderModes, viewportBounds]);

  React.useEffect(() => {
    const assigned = placeMissingPages(
      pages.map((page) => ({
        id: page.id,
        width: getPageFrameWidth(resolvePageFrameDevice(page.deviceType, activeDevice)),
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
      if (layoutSaveIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(layoutSaveIndicatorTimeoutRef.current);
      }
      if (layoutSaveActiveRef.current) {
        layoutSaveActiveRef.current = false;
        endSaving();
      }
    },
    [endSaving],
  );

  React.useEffect(() => {
    if (!layoutStorageKey || typeof window === "undefined") {
      return;
    }

    const hasAllPositions = pages.every((page) => pagePositions[page.id]);
    const hasAllStackEntries = pages.every((page) => pageStackOrder.includes(page.id));
    if (!hasAllPositions || !hasAllStackEntries) {
      return;
    }

    if (!hasCompletedInitialLayoutRef.current) {
      hasCompletedInitialLayoutRef.current = true;
      return;
    }

    if (layoutSaveTimeoutRef.current !== null) {
      window.clearTimeout(layoutSaveTimeoutRef.current);
    }

    layoutSaveTimeoutRef.current = window.setTimeout(() => {
      layoutSaveTimeoutRef.current = null;
      beginSaving();
      layoutSaveActiveRef.current = true;

      try {
        try {
          window.localStorage.setItem(
            layoutStorageKey,
            JSON.stringify({
              version: 2,
              camera,
              pagePositions,
              pageStackOrder,
              pageGroups,
            }),
          );
        } catch (error) {
          logger.error("wire_layout_persist_failed", { error });
        }
      } finally {
        if (layoutSaveIndicatorTimeoutRef.current !== null) {
          window.clearTimeout(layoutSaveIndicatorTimeoutRef.current);
        }

        layoutSaveIndicatorTimeoutRef.current = window.setTimeout(() => {
          layoutSaveIndicatorTimeoutRef.current = null;
          layoutSaveActiveRef.current = false;
          endSaving();
        }, LAYOUT_SAVE_ICON_MS);
      }
    }, LAYOUT_SAVE_IDLE_MS);
  }, [
    beginSaving,
    camera,
    endSaving,
    layoutStorageKey,
    pageGroups,
    pagePositions,
    pageStackOrder,
    pages,
  ]);

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
      // camera update per animation frame keeps React to one render a frame.
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
      if (isEditableTarget(event.target)) {
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

      panStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialCamera: camera,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [camera, isPanModeActive],
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
  // focus handler replaces it with just this page.
  const handlePagePointerDownCapture = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.shiftKey || activeTool !== "select" || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setFocusedPage(pageId);
      setSelectedPageIds((current) =>
        current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId],
      );
    },
    [activeTool, setFocusedPage],
  );

  const handlePagePointerDown = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        activeTool !== "select" ||
        isSpacePanning ||
        event.button !== 0 ||
        event.pointerType === "touch"
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setFocusedPage(pageId);
      setSelectedPageIds((current) => (current.includes(pageId) ? current : [pageId]));
      bringPageToFront(pageId);

      pageDragStateRef.current = {
        pageId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialPosition: pageBoundsById[pageId]
          ? {
              x: pageBoundsById[pageId].left,
              y: pageBoundsById[pageId].top,
            }
          : { x: 0, y: 0 },
        hasMoved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      activeTool,
      bringPageToFront,
      isSpacePanning,
      pageBoundsById,
      setFocusedPage,
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

      const candidatePosition = {
        x: dragState.initialPosition.x + viewportDeltaX / scale,
        y: dragState.initialPosition.y + viewportDeltaY / scale,
      };
      const draggedLayout = pageLayouts.find(
        (layout) => layout.page.id === pageId,
      );
      const snapped = getSnappedPagePosition({
        movingPageId: pageId,
        position: candidatePosition,
        width:
          draggedLayout?.currentDevice.width ??
          pageBoundsById[pageId]?.width ??
          getPageFrameWidth(resolvePageFrameDevice(undefined, activeDevice)),
        height:
          pageBoundsById[pageId]?.height ??
          draggedLayout?.frameHeight ??
          0,
        otherPages: pageLayouts.map((pageLayout) => pageLayout.bounds),
        scale,
        disabled: event.metaKey || event.ctrlKey,
      });

      setPagePosition(pageId, snapped.position);
      setSnapGuides(snapped.guides);
      event.preventDefault();
    },
    [
      activeDevice,
      pageBoundsById,
      pageLayouts,
      scale,
      setPagePosition,
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
      setDraggingPageId(null);
      setSnapGuides([]);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    },
    [],
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
      setSelectedPageIds((current) => (current.includes(pageId) ? current : [pageId]));
    },
    [setFocusedPage],
  );

  const groupSelection = React.useCallback(() => {
    if (selectedPageIds.length < 2) return;
    groupPages(selectedPageIds);
    setSelectedPageIds([]);
  }, [groupPages, selectedPageIds]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPageIds([]);
      if (event.key.toLowerCase() !== "g" || !(event.metaKey || event.ctrlKey)) return;
      if (isEditableTarget(event.target) || selectedPageIds.length === 0) return;
      event.preventDefault();
      if (!event.shiftKey) {
        groupSelection();
        return;
      }
      for (const group of pageGroups) {
        if (group.pageIds.some((pageId) => selectedPageIds.includes(pageId))) {
          ungroupPages(group.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [groupSelection, pageGroups, selectedPageIds, ungroupPages]);

  const handleGroupPointerDown = React.useCallback(
    (pageIds: string[]) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool !== "select" || isSpacePanning || event.button !== 0) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      groupDragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
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
    [activeTool, isSpacePanning, pageBoundsById],
  );

  const handleGroupPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = groupDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaX = (event.clientX - dragState.startClientX) / scale;
      const deltaY = (event.clientY - dragState.startClientY) / scale;
      setPagePositions(
        Object.fromEntries(
          Object.entries(dragState.initialPositions).map(([pageId, position]) => [
            pageId,
            { x: position.x + deltaX, y: position.y + deltaY },
          ]),
        ),
      );
    },
    [scale, setPagePositions],
  );

  const stopGroupDrag = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (groupDragStateRef.current?.pointerId !== event.pointerId) return;
    groupDragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

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
        onCanvasClick();
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={stopCanvasInteraction}
      onPointerCancel={stopCanvasInteraction}
      style={CANVAS_BACKGROUND_STYLES[canvasBackground]}
    >
      <div className="pointer-events-none absolute inset-0 canvas-dots" />
      <div
        className="absolute"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          // Page titles and toolbars counter-scale off this variable, so a zoom
          // tick restyles them without re-rendering any page.
          ["--canvas-inverse-zoom" as string]: 100 / Math.max(20, camera.zoom),
          left: "50%",
          top: `${CANVAS_TOP_OFFSET}px`,
          // Promote the scene to its own layer so pan and zoom composite on
          // the GPU instead of repainting every frame on the main thread.
          willChange: "transform",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          {groupFrames.map(({ group, bounds }) => (
            <PageGroupFrame
              key={group.id}
              name={group.name}
              left={bounds.left - GROUP_PADDING}
              top={bounds.top - GROUP_PADDING - GROUP_TITLE_ROW}
              width={bounds.width + GROUP_PADDING * 2}
              height={bounds.height + GROUP_PADDING * 2 + GROUP_TITLE_ROW}
              isSelected={group.pageIds.every((pageId) => selectedPageIds.includes(pageId))}
              onRename={(name) => renamePageGroup(group.id, name)}
              onUngroup={() => ungroupPages(group.id)}
              onPointerDown={handleGroupPointerDown(group.pageIds)}
              onPointerMove={handleGroupPointerMove}
              onPointerUp={stopGroupDrag}
            />
          ))}
          {pageLayouts.map((pageLayout) => {
            // A mounted frame stays live after it scrolls away. Unmounting it
            // meant zooming back out rebuilt every returning iframe in the same
            // frame, mid-gesture, each re-parsing its HTML and re-running
            // Tailwind. The browser already skips painting offscreen iframes.
            // ponytail: memory grows with every page ever viewed; evict least
            // recently visible frames if projects reach dozens of pages.
            const renderMode: PageRenderMode = mountedPageIds.has(pageLayout.page.id)
              ? "live"
              : "shell";

            return (
              <div
                key={pageLayout.page.id}
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
                onPointerMove={handlePagePointerMove(pageLayout.page.id)}
                onPointerUp={stopPageDrag(pageLayout.page.id)}
                onPointerCancel={stopPageDrag(pageLayout.page.id)}
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
                />
              </div>
            );
          })}

          {snapGuides.map((guide, index) => {
            if (guide.orientation === "vertical") {
              return (
                <div
                  key={`vertical-${index}`}
                  className="absolute bg-rose-500/90"
                  style={{
                    left: `${guide.position}px`,
                    top: `${guide.start}px`,
                    width: `${1 / scale}px`,
                    height: `${guide.end - guide.start}px`,
                  }}
                />
              );
            }

            return (
              <div
                key={`horizontal-${index}`}
                className="absolute bg-rose-500/90"
                style={{
                  left: `${guide.start}px`,
                  top: `${guide.position}px`,
                  width: `${guide.end - guide.start}px`,
                  height: `${1 / scale}px`,
                }}
              />
            );
          })}
        </div>
      </div>

      {selectedPageIds.length > 1 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            groupSelection();
          }}
          title="Group selection (Ctrl+G)"
          className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs font-medium text-foreground shadow-lg hover:bg-accent"
        >
          Group {selectedPageIds.length} pages
        </button>
      ) : null}

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
 * page stretches it. The title bar above it drags every page in the group;
 * double-click the name to rename it.
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
      className={`pointer-events-none absolute rounded-xl border bg-foreground/[0.03] ${
        isSelected ? "border-sky-500" : "border-foreground/15"
      }`}
      style={{
        left,
        top,
        width,
        height,
        zIndex: 0,
        borderWidth: "calc(1px * var(--canvas-inverse-zoom, 1))",
      }}
    >
      <div
        className="pointer-events-auto absolute bottom-full left-0 flex origin-bottom-left cursor-grab items-center gap-1.5 pb-1.5 text-[color:var(--canvas-label-strong,var(--foreground))] active:cursor-grabbing"
        style={{ transform: "scale(clamp(0.4, var(--canvas-inverse-zoom, 1), 4))" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setIsRenaming(true)}
      >
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={name}
            aria-label="Group name"
            className="h-6 w-40 rounded border border-sky-500 bg-background px-1.5 text-sm text-foreground outline-none"
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
          <span className="whitespace-nowrap text-sm font-semibold">{name}</span>
        )}
        <button
          type="button"
          onClick={onUngroup}
          aria-label={`Ungroup ${name}`}
          title="Ungroup (Ctrl+Shift+G)"
          className="rounded p-0.5 text-[color:var(--canvas-label,var(--muted-foreground))] hover:bg-foreground/10"
        >
          <Ungroup className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
