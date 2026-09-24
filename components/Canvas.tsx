"use client";

import React from "react";
import { useShallow } from "zustand/react/shallow";
import { logger } from "@/lib/logger";
import { useEditorStore } from "@/store/useEditorStore";
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
  createDefaultCamera,
  getDefaultPageX,
  getPageBounds,
  getPageFrameHeight,
  getPageFrameWidth,
  getPageRenderMode,
  getSnappedPagePosition,
  getViewportBounds,
  placeMissingPages,
  resolvePageFrameDevice,
  scaleFromZoom,
  zoomAtViewportPoint,
} from "@/lib/canvasScene";

const DEVICE_LABELS = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
} as const;

const DRAG_START_THRESHOLD_PX = 4;
const LAYOUT_SAVE_IDLE_MS = 700;
const LAYOUT_SAVE_ICON_MS = 350;

interface PointerDragState {
  pageId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialPosition: ScenePoint;
  hasMoved: boolean;
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
    activeDevice,
    viewportSize,
    pages,
    pagePositions,
    pageStackOrder,
    pageFrameHeights,
    pageStatuses,
    focusedPageId,
    beginSaving,
    endSaving,
    setCamera,
    panBy,
    setPagePosition,
    bringPageToFront,
    setFocusedPage,
    setPageFrameHeight,
  } = useEditorStore(
    useShallow((state) => ({
      camera: state.camera,
      activeDevice: state.activeDevice,
      viewportSize: state.viewportSize,
      pages: state.pages,
      pagePositions: state.pagePositions,
      pageStackOrder: state.pageStackOrder,
      pageFrameHeights: state.pageFrameHeights,
      pageStatuses: state.pageStatuses,
      focusedPageId: state.focusedPageId,
      beginSaving: state.beginSaving,
      endSaving: state.endSaving,
      setCamera: state.setCamera,
      panBy: state.panBy,
      setPagePosition: state.setPagePosition,
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
  const panStateRef = React.useRef<CanvasPanState | null>(null);
  const pointersRef = React.useRef<Map<number, ScenePoint>>(new Map());
  const pinchStateRef = React.useRef<PinchState | null>(null);
  const layoutSaveTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveIndicatorTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveActiveRef = React.useRef(false);
  const hasCompletedInitialLayoutRef = React.useRef(false);
  const [draggingPageId, setDraggingPageId] = React.useState<string | null>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const [snapGuides, setSnapGuides] = React.useState<SnapGuide[]>([]);

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

  const viewportBounds = React.useMemo(
    () => getViewportBounds(camera, viewportSize),
    [camera, viewportSize],
  );

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

      // The camera is read fresh per event rather than closed over, so this
      // callback stays stable and the listener effect subscribes once instead
      // of re-subscribing on every camera tick.
      const { camera, viewportSize } = useEditorStore.getState();

      if (event.ctrlKey || event.metaKey) {
        const isLikelyMouseWheel =
          event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
          Math.abs(event.deltaY) >= 40;
        const sensitivity = isLikelyMouseWheel ? 0.0025 : 0.007;
        const zoomFactor = Math.exp(-event.deltaY * sensitivity);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }

        setCamera(
          zoomAtViewportPoint({
            camera,
            viewportPoint: {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            },
            viewport: viewportSize,
            nextZoom: camera.zoom * zoomFactor,
          }),
        );
        return;
      }

      panBy({
        x: -event.deltaX * 0.6,
        y: -event.deltaY * 0.6,
      });
    },
    [canvasRef, panBy, setCamera],
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
    },
    [setFocusedPage],
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
      onClick={onCanvasClick}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={stopCanvasInteraction}
      onPointerCancel={stopCanvasInteraction}
    >
      <div className="pointer-events-none absolute inset-0 canvas-dots" />
      <div
        className="absolute"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          left: "50%",
          top: `${CANVAS_TOP_OFFSET}px`,
          // Promote the scene to its own layer so pan and zoom composite on
          // the GPU instead of repainting every frame on the main thread.
          willChange: "transform",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative">
          {pageLayouts.map((pageLayout) => {
            const renderMode: PageRenderMode = getPageRenderMode(
              pageLayout.bounds,
              viewportBounds,
            );

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
                  status={pageStatuses[pageLayout.page.id] ?? null}
                  isOnlyPage={pages.length <= 1}
                  isFocused={focusedPageId === pageLayout.page.id}
                  frameHeight={pageLayout.frameHeight}
                  renderMode={renderMode}
                  zoom={camera.zoom}
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

      <CanvasToolbar
        activeTool={activeTool}
        onToolChange={onToolChange}
        zoom={camera.zoom}
        onZoomChange={(zoom) => {
          setCamera(
            zoomAtViewportPoint({
              camera,
              viewportPoint: {
                x: viewportSize.width / 2,
                y: viewportSize.height / 2,
              },
              viewport: viewportSize,
              nextZoom: zoom,
            }),
          );
        }}
        onReset={() => setCamera(createDefaultCamera())}
      />
    </div>
  );
}
