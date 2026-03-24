"use client";

import React from "react";
import { useEditorStore } from "@/store/useEditorStore";
import CanvasToolbar from "./CanvasToolbar";
import PageRenderer from "./PageRenderer";

const DEVICE_DIMENSIONS = {
  desktop: { width: 1440, height: 900, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 375, height: 812, label: "Mobile" },
} as const;
const PAGE_GAP = 120;
const LAYOUT_SAVE_IDLE_MS = 700;
const LAYOUT_SAVE_ICON_MS = 350;

interface DragState {
  pageId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
}

interface CanvasProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  projectId?: string;
  panOffset: { x: number; y: number };
  zoom: number;
  activeDevice: keyof typeof DEVICE_DIMENSIONS;
  activeTool: "select" | "grab";
  isPanning: boolean;
  onCanvasClick: () => void;
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onEditPage?: (pageId: string) => void;
  onToolChange: (tool: "select" | "grab") => void;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}

export default function Canvas({
  canvasRef,
  projectId,
  panOffset,
  zoom,
  activeDevice,
  activeTool,
  isPanning,
  onCanvasClick,
  onRenamePage,
  onDeletePage,
  onEditPage,
  onToolChange,
  onZoomChange,
  onReset,
}: CanvasProps) {
  const pages = useEditorStore((state) => state.pages);
  const pagePositions = useEditorStore((state) => state.pagePositions);
  const pageStackOrder = useEditorStore((state) => state.pageStackOrder);
  const beginSaving = useEditorStore((state) => state.beginSaving);
  const endSaving = useEditorStore((state) => state.endSaving);
  const setPagePosition = useEditorStore((state) => state.setPagePosition);
  const bringPageToFront = useEditorStore((state) => state.bringPageToFront);
  const currentDevice = DEVICE_DIMENSIONS[activeDevice];
  const dragStateRef = React.useRef<DragState | null>(null);
  const layoutSaveTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveIndicatorTimeoutRef = React.useRef<number | null>(null);
  const layoutSaveActiveRef = React.useRef(false);
  const [draggingPageId, setDraggingPageId] = React.useState<string | null>(null);
  const layoutStorageKey = React.useMemo(
    () => (projectId ? `wirely-wire-layout:${projectId}` : null),
    [projectId],
  );

  const defaultPositions = React.useMemo(() => {
    const totalWidth =
      pages.length * currentDevice.width + Math.max(0, pages.length - 1) * PAGE_GAP;

    return pages.map((page, index) => ({
      pageId: page.id,
      x: index * (currentDevice.width + PAGE_GAP) - totalWidth / 2,
      y: 0,
    }));
  }, [pages, currentDevice.width]);

  React.useEffect(() => {
    for (const position of defaultPositions) {
      if (pagePositions[position.pageId]) continue;
      setPagePosition(position.pageId, { x: position.x, y: position.y });
    }
  }, [defaultPositions, pagePositions, setPagePosition]);

  React.useEffect(() => {
    for (const page of pages) {
      if (pageStackOrder.includes(page.id)) continue;
      bringPageToFront(page.id);
    }
  }, [bringPageToFront, pageStackOrder, pages]);

  const pageZIndices = React.useMemo(
    () =>
      pageStackOrder.reduce<Record<string, number>>((accumulator, pageId, index) => {
        accumulator[pageId] = index + 1;
        return accumulator;
      }, {}),
    [pageStackOrder],
  );

  const queueLayoutSave = React.useCallback(() => {
    if (!layoutStorageKey || typeof window === "undefined") return;

    if (layoutSaveTimeoutRef.current !== null) {
      window.clearTimeout(layoutSaveTimeoutRef.current);
    }

    layoutSaveTimeoutRef.current = window.setTimeout(() => {
      layoutSaveTimeoutRef.current = null;
      beginSaving();
      layoutSaveActiveRef.current = true;
      try {
        window.localStorage.setItem(
          layoutStorageKey,
          JSON.stringify({
            pagePositions: useEditorStore.getState().pagePositions,
            pageStackOrder: useEditorStore.getState().pageStackOrder,
          }),
        );
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
  }, [beginSaving, endSaving, layoutStorageKey]);

  React.useEffect(
    () => () => {
      if (layoutSaveTimeoutRef.current !== null) {
        window.clearTimeout(layoutSaveTimeoutRef.current);
      }
      if (layoutSaveIndicatorTimeoutRef.current !== null) {
        window.clearTimeout(layoutSaveIndicatorTimeoutRef.current);
        layoutSaveIndicatorTimeoutRef.current = null;
      }
      if (layoutSaveActiveRef.current) {
        layoutSaveActiveRef.current = false;
        endSaving();
      }
    },
    [endSaving],
  );

  const handlePagePointerDown = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (activeTool !== "select" || event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      bringPageToFront(pageId);
      queueLayoutSave();

      const existing = pagePositions[pageId] ?? { x: 0, y: 0 };
      dragStateRef.current = {
        pageId,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialX: existing.x,
        initialY: existing.y,
      };
      setDraggingPageId(pageId);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [activeTool, bringPageToFront, pagePositions, queueLayoutSave],
  );

  const handlePagePointerMove = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (dragState.pageId !== pageId || dragState.pointerId !== event.pointerId) {
        return;
      }

      event.preventDefault();
      const scale = Math.max(0.01, zoom / 100);
      const deltaX = (event.clientX - dragState.startClientX) / scale;
      const deltaY = (event.clientY - dragState.startClientY) / scale;
      setPagePosition(pageId, {
        x: dragState.initialX + deltaX,
        y: dragState.initialY + deltaY,
      });
      queueLayoutSave();
    },
    [queueLayoutSave, setPagePosition, zoom],
  );

  const stopPageDrag = React.useCallback(
    (pageId: string) => (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      if (dragState.pageId !== pageId || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
      setDraggingPageId(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  return (
    <div
      ref={canvasRef}
      className={`relative w-full h-full overflow-hidden select-none ${
        activeTool === "grab" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      onClick={onCanvasClick}
    >
      <div className="pointer-events-none absolute inset-0 canvas-dots" />
      <div
        className="absolute"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`,
          transformOrigin: "0 0",
          left: "50%",
          top: "100px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {pages.length === 0 ? null : (
            pages.map((page) => {
              const position = pagePositions[page.id];
              return (
                <div
                  key={page.id}
                  className={`absolute ${
                    activeTool === "select"
                      ? draggingPageId === page.id
                        ? "cursor-grabbing"
                        : "cursor-grab"
                      : ""
                  }`}
                  style={{
                    left: `${position?.x ?? 0}px`,
                    top: `${position?.y ?? 0}px`,
                    zIndex: pageZIndices[page.id] ?? 0,
                  }}
                  onPointerDown={handlePagePointerDown(page.id)}
                  onPointerMove={handlePagePointerMove(page.id)}
                  onPointerUp={stopPageDrag(page.id)}
                  onPointerCancel={stopPageDrag(page.id)}
                >
                  <PageRenderer
                    page={page}
                    onRenamePage={onRenamePage}
                    onDeletePage={onDeletePage}
                    onEditPage={onEditPage}
                    currentDevice={currentDevice}
                    isOnlyPage={pages.length <= 1}
                    zoom={zoom}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
      <CanvasToolbar
        activeTool={activeTool}
        onToolChange={onToolChange}
        zoom={zoom}
        onZoomChange={onZoomChange}
        onReset={onReset}
      />
    </div>
  );
}
