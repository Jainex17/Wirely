"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";
import Canvas from "./Canvas";
import { toast } from "@/components/ui/sonner";
import { logger } from "@/lib/logger";

const MIN_ZOOM = 5;
const MAX_ZOOM = 200;
const TRACKPAD_ZOOM_SENSITIVITY = 0.007;
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.0025;
const CANVAS_TOP_OFFSET = 100;
const PAGE_GAP = 120;

const DEVICE_WIDTHS = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
} as const;

const DEVICE_HEIGHTS = {
  desktop: 900,
  tablet: 1024,
  mobile: 812,
} as const;

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  projectId?: string;
}

export default function EditorWorkspace({
  sidebarMode = "default",
  projectId,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const hasInitializedViewportRef = useRef(false);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);
  const [activeTool, setActiveTool] = useState<"select" | "grab">("select");
  const [isPanning, setIsPanning] = useState(false);

  const {
    zoom,
    panOffset,
    activeDevice,
    beginSaving,
    endSaving,
    setZoom,
    setPanOffset,
    setSelectedSection,
    renamePage,
    deletePage,
    hydrateProject,
    pagePositions,
    pages,
  } = useEditorStore();

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      setZoom(Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM));
    },
    [setZoom],
  );

  const handleReset = useCallback(() => {
    setZoom(64);
    setPanOffset({ x: 0, y: 0 });
  }, [setZoom, setPanOffset]);

  const handleCanvasClick = useCallback(() => {
    if (activeTool === "grab") return;
    setSelectedSection(null);
  }, [activeTool, setSelectedSection]);

  const handleRenamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      const existingPage = pages.find((page) => page.id === pageId);
      if (!existingPage) return;

      renamePage(pageId, newTitle);

      if (!projectId) return;

      beginSaving();
      try {
        const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });

        if (!response.ok) {
          throw new Error(`Rename failed with status ${response.status}`);
        }
      } catch (error) {
        logger.error("pages_rename_failed", { pageId, projectId, error });
        renamePage(pageId, existingPage.title);
        toast.error("Could not rename page. Please try again.");
      } finally {
        endSaving();
      }
    },
    [beginSaving, endSaving, pages, projectId, renamePage],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) return;

      deletePage(pageId);

      if (!projectId) return;

      beginSaving();
      try {
        const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`Delete failed with status ${response.status}`);
        }
        toast.success("Page deleted.");
      } catch (error) {
        logger.error("pages_delete_failed", { pageId, projectId, error });
        toast.error("Could not delete page. Restoring latest server data.");

        try {
          const reloadResponse = await fetch(`/api/projects/${projectId}`, {
            cache: "no-store",
          });
          if (!reloadResponse.ok) {
            throw new Error(`Reload failed with status ${reloadResponse.status}`);
          }
          const payload = (await reloadResponse.json()) as {
            pages?: Array<{ id: string; title: string; htmlContent: string }>;
          };
          const reloadedPages =
            payload.pages?.map((item) => ({
              id: item.id,
              title: item.title,
              iframeHtml: item.htmlContent,
              sections: [] as string[],
            })) ?? [];
          hydrateProject(reloadedPages);
        } catch (reloadError) {
          logger.error("pages_reload_after_delete_failure", {
            pageId,
            projectId,
            reloadError,
          });
          toast.error("Could not restore latest server data.");
        }
      } finally {
        endSaving();
      }
    },
    [beginSaving, deletePage, endSaving, hydrateProject, pages, projectId],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-scroll-lock="modal"]')
      ) {
        return;
      }
      e.preventDefault();

      const state = useEditorStore.getState();
      const currentZoom = state.zoom;
      const currentPanOffset = state.panOffset;
      const setZoom = state.setZoom;
      const setPanOffset = state.setPanOffset;

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY;
        const isLikelyMouseWheel =
          e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL ||
          Math.abs(e.deltaY) >= 40;
        const sensitivity = isLikelyMouseWheel
          ? MOUSE_WHEEL_ZOOM_SENSITIVITY
          : TRACKPAD_ZOOM_SENSITIVITY;
        const zoomFactor = Math.exp(delta * sensitivity);
        const newZoom = Math.min(
          Math.max(currentZoom * zoomFactor, MIN_ZOOM),
          MAX_ZOOM,
        );

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const canvasCenterX = rect.width / 2;
        const canvasTopOffset = 100;

        const contentX =
          (mouseX - canvasCenterX - currentPanOffset.x) / (currentZoom / 100);
        const contentY =
          (mouseY - canvasTopOffset - currentPanOffset.y) / (currentZoom / 100);

        const newPanX = mouseX - canvasCenterX - contentX * (newZoom / 100);
        const newPanY = mouseY - canvasTopOffset - contentY * (newZoom / 100);

        setZoom(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      } else {
        setPanOffset({
          x: currentPanOffset.x - e.deltaX * 0.6,
          y: currentPanOffset.y - e.deltaY * 0.6,
        });
      }
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const stopPanning = () => {
      panDragRef.current = null;
      setIsPanning(false);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (activeTool !== "grab" || e.button !== 0) return;

      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('[data-scroll-lock="modal"]')
      ) {
        return;
      }

      e.preventDefault();
      const state = useEditorStore.getState();
      panDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: state.panOffset.x,
        initialPanY: state.panOffset.y,
      };
      setIsPanning(true);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dragState = panDragRef.current;
      if (!dragState) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaY = e.clientY - dragState.startY;
      useEditorStore.getState().setPanOffset({
        x: dragState.initialPanX + deltaX,
        y: dragState.initialPanY + deltaY,
      });
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopPanning);
    window.addEventListener("blur", stopPanning);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopPanning);
      window.removeEventListener("blur", stopPanning);
      stopPanning();
    };
  }, [activeTool]);

  useEffect(() => {
    hasInitializedViewportRef.current = false;
  }, [projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pages.length === 0) return;
    if (hasInitializedViewportRef.current) return;

    const pageWidth = DEVICE_WIDTHS[activeDevice];
    const pageHeight = DEVICE_HEIGHTS[activeDevice];
    const defaultTotalWidth =
      pages.length * pageWidth + Math.max(0, pages.length - 1) * PAGE_GAP;
    const scale = zoom / 100;
    const viewportLeft = -panOffset.x / scale;
    const viewportTop = -panOffset.y / scale;
    const viewportRight = viewportLeft + canvas.clientWidth / scale;
    const viewportBottom = viewportTop + canvas.clientHeight / scale;

    const hasVisiblePage = pages.some((page, index) => {
      const fallbackX = index * (pageWidth + PAGE_GAP) - defaultTotalWidth / 2;
      const position = pagePositions[page.id] ?? { x: fallbackX, y: 0 };
      const pageLeft = position.x;
      const pageTop = position.y;
      const pageRight = pageLeft + pageWidth;
      const pageBottom = pageTop + pageHeight;

      return (
        pageRight > viewportLeft &&
        pageLeft < viewportRight &&
        pageBottom > viewportTop &&
        pageTop < viewportBottom
      );
    });

    hasInitializedViewportRef.current = true;
    if (hasVisiblePage) return;

    const targetPage = pages[0];
    if (!targetPage) return;

    const fallbackX = -defaultTotalWidth / 2;
    const targetPosition = pagePositions[targetPage.id] ?? { x: fallbackX, y: 0 };
    const centeredPanX = canvas.clientWidth / 2 - (targetPosition.x + pageWidth / 2) * scale;
    const centeredPanY = CANVAS_TOP_OFFSET + 48 - targetPosition.y * scale;

    setPanOffset({
      x: centeredPanX,
      y: centeredPanY,
    });
  }, [activeDevice, pagePositions, pages, panOffset.x, panOffset.y, projectId, setPanOffset, zoom]);

  return (
    <div data-sidebar-mode={sidebarMode} className="relative w-full h-full">
      <Canvas
        canvasRef={canvasRef}
        projectId={projectId}
        panOffset={panOffset}
        zoom={zoom}
        activeDevice={activeDevice}
        activeTool={activeTool}
        isPanning={isPanning}
        onCanvasClick={handleCanvasClick}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        onToolChange={setActiveTool}
        onZoomChange={handleZoomChange}
        onReset={handleReset}
      />
    </div>
  );
}
