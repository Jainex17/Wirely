"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import Canvas from "./Canvas";
import PagePreviewModal from "./PagePreviewModal";

const MIN_ZOOM = 5;
const MAX_ZOOM = 200;
const TRACKPAD_ZOOM_SENSITIVITY = 0.007;
const MOUSE_WHEEL_ZOOM_SENSITIVITY = 0.0025;

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  projectId?: string;
}

export default function EditorWorkspace({
  sidebarMode = "default",
  projectId,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"select" | "grab">("select");
  const [isPanning, setIsPanning] = useState(false);

  const {
    zoom,
    panOffset,
    activeDevice,
    setZoom,
    setPanOffset,
    setSelectedSection,
    renamePage,
    deletePage,
    hydrateProject,
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

  const handlePreviewPage = useCallback((pageId: string) => {
    setPreviewPageId(pageId);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewPageId(null);
  }, []);

  const handleRenamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      const existingPage = pages.find((page) => page.id === pageId);
      if (!existingPage) return;

      renamePage(pageId, newTitle);

      if (!projectId) return;

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
        console.error("[pages:rename]", error);
        renamePage(pageId, existingPage.title);
        window.alert("Could not rename page. Please try again.");
      }
    },
    [pages, projectId, renamePage],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const page = pages.find((candidate) => candidate.id === pageId);
      if (!page) return;

      deletePage(pageId);

      if (!projectId) return;

      try {
        const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`Delete failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("[pages:delete]", error);
        window.alert("Could not delete page. Restoring latest server data.");

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
          console.error("[pages:reload_after_delete_failure]", reloadError);
        }
      }
    },
    [deletePage, hydrateProject, pages, projectId],
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

  return (
    <div data-sidebar-mode={sidebarMode} className="relative w-full h-full">
      <Canvas
        canvasRef={canvasRef}
        panOffset={panOffset}
        zoom={zoom}
        activeDevice={activeDevice}
        activeTool={activeTool}
        isPanning={isPanning}
        onCanvasClick={handleCanvasClick}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        onPreviewPage={handlePreviewPage}
        onToolChange={setActiveTool}
        onZoomChange={handleZoomChange}
        onReset={handleReset}
      />
      <PagePreviewModal
        isOpen={previewPageId !== null}
        onClose={handleClosePreview}
        page={
          previewPageId
            ? pages.find((p) => p.id === previewPageId) || null
            : null
        }
      />
    </div>
  );
}
