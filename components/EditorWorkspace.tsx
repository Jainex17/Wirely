"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/sonner";
import {
  getDefaultPageX,
  getPageBounds,
  getPageFrameHeight,
  getPageFrameWidth,
  getViewportBounds,
  isBoundsIntersecting,
  resolvePageFrameDevice,
  zoomAtViewportPoint,
} from "@/lib/canvasScene";
import { logger } from "@/lib/logger";
import { useEditorStore } from "@/store/useEditorStore";
import Canvas from "./Canvas";

const ZOOM_LEVELS = [2, 5, 10, 25, 50, 75, 100, 125, 150, 200];

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  projectId?: string;
  onEditPage?: (pageId: string) => void;
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

export default function EditorWorkspace({
  sidebarMode = "default",
  projectId,
  onEditPage,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const hasInitializedViewportRef = useRef(false);
  const [activeTool, setActiveTool] = useState<"select" | "grab">("select");
  const [isSpacePanning, setIsSpacePanning] = useState(false);

  const {
    camera,
    activeDevice,
    pagePositions,
    pageFrameHeights,
    pages,
    requestedGeneratedPageFocusIds,
    beginSaving,
    endSaving,
    setCamera,
    setViewportSize,
    resetView,
    focusPage,
    focusPages,
    fitAllPages,
    clearRequestedGeneratedPageFocusCheck,
    setSelectedSection,
    renamePage,
    deletePage,
    hydrateProject,
  } = useEditorStore(
    useShallow((state) => ({
      camera: state.camera,
      activeDevice: state.activeDevice,
      pagePositions: state.pagePositions,
      pageFrameHeights: state.pageFrameHeights,
      pages: state.pages,
      requestedGeneratedPageFocusIds: state.requestedGeneratedPageFocusIds,
      beginSaving: state.beginSaving,
      endSaving: state.endSaving,
      setCamera: state.setCamera,
      setViewportSize: state.setViewportSize,
      resetView: state.resetView,
      focusPage: state.focusPage,
      focusPages: state.focusPages,
      fitAllPages: state.fitAllPages,
      clearRequestedGeneratedPageFocusCheck: state.clearRequestedGeneratedPageFocusCheck,
      setSelectedSection: state.setSelectedSection,
      renamePage: state.renamePage,
      deletePage: state.deletePage,
      hydrateProject: state.hydrateProject,
    })),
  );

  const pageBoundsById = useMemo(() => {
    const result = new Map<string, ReturnType<typeof getPageBounds>>();
    for (const [index, page] of pages.entries()) {
      const device = resolvePageFrameDevice(page.deviceType, activeDevice);
      const deviceWidth = getPageFrameWidth(device);
      const deviceHeight = getPageFrameHeight(device);
      const position = pagePositions[page.id] ?? {
        x: getDefaultPageX(index, pages.length, deviceWidth),
        y: 0,
      };
      const height = Math.max(
        deviceHeight,
        pageFrameHeights[page.id] ?? deviceHeight,
      );

      result.set(
        page.id,
        getPageBounds({
          pageId: page.id,
          position,
          width: deviceWidth,
          height,
        }),
      );
    }
    return result;
  }, [
    activeDevice,
    pageFrameHeights,
    pagePositions,
    pages,
  ]);

  const handleCanvasClick = useCallback(() => {
    if (activeTool === "grab" || isSpacePanning) return;
    setSelectedSection(null);
  }, [activeTool, isSpacePanning, setSelectedSection]);

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
    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setViewportSize({ width, height });
    });
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setViewportSize]);

  useEffect(() => {
    hasInitializedViewportRef.current = false;
  }, [projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pages.length === 0) return;
    if (hasInitializedViewportRef.current) return;

    const viewportBounds = getViewportBounds(camera, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    const hasVisiblePage = pages.some((page) => {
      const bounds = pageBoundsById.get(page.id);
      return bounds ? isBoundsIntersecting(bounds, viewportBounds) : false;
    });

    hasInitializedViewportRef.current = true;
    if (!hasVisiblePage) {
      focusPage(pages[0].id);
    }
  }, [camera, focusPage, pageBoundsById, pages]);

  useEffect(() => {
    if (!requestedGeneratedPageFocusIds || requestedGeneratedPageFocusIds.length === 0) {
      return;
    }
    if (!canvasRef.current) {
      return;
    }

    const viewportBounds = getViewportBounds(camera, {
      width: canvasRef.current.clientWidth,
      height: canvasRef.current.clientHeight,
    });
    const generatedBounds = requestedGeneratedPageFocusIds
      .map((pageId) => pageBoundsById.get(pageId))
      .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds));
    const hasVisibleGeneratedPage = generatedBounds.some((bounds) =>
      isBoundsIntersecting(bounds, viewportBounds),
    );

    if (!hasVisibleGeneratedPage) {
      focusPages(requestedGeneratedPageFocusIds);
    }

    clearRequestedGeneratedPageFocusCheck();
  }, [
    camera,
    clearRequestedGeneratedPageFocusCheck,
    focusPages,
    pageBoundsById,
    requestedGeneratedPageFocusIds,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        if (!event.repeat) {
          setIsSpacePanning(true);
        }
        event.preventDefault();
        return;
      }

      if (event.key === "0") {
        resetView();
        event.preventDefault();
        return;
      }

      if (event.shiftKey && event.key === "1") {
        fitAllPages();
        event.preventDefault();
        return;
      }

      if (event.key === "=" || event.key === "+") {
        const nextZoom =
          ZOOM_LEVELS.find((level) => level > camera.zoom) ??
          ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
        setCamera(
          zoomAtViewportPoint({
            camera,
            viewportPoint: {
              x: (canvasRef.current?.clientWidth ?? 0) / 2,
              y: (canvasRef.current?.clientHeight ?? 0) / 2,
            },
            viewport: useEditorStore.getState().viewportSize,
            nextZoom,
          }),
        );
        event.preventDefault();
        return;
      }

      if (event.key === "-") {
        const currentIndex = ZOOM_LEVELS.findIndex((level) => level >= camera.zoom);
        const nextZoom =
          currentIndex > 0 ? ZOOM_LEVELS[currentIndex - 1] : ZOOM_LEVELS[0];
        setCamera(
          zoomAtViewportPoint({
            camera,
            viewportPoint: {
              x: (canvasRef.current?.clientWidth ?? 0) / 2,
              y: (canvasRef.current?.clientHeight ?? 0) / 2,
            },
            viewport: useEditorStore.getState().viewportSize,
            nextZoom,
          }),
        );
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [camera, fitAllPages, resetView, setCamera]);

  return (
    <div data-sidebar-mode={sidebarMode} className="relative h-full w-full">
      <Canvas
        canvasRef={canvasRef}
        projectId={projectId}
        activeTool={activeTool}
        isSpacePanning={isSpacePanning}
        onCanvasClick={handleCanvasClick}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        onEditPage={onEditPage}
        onToolChange={setActiveTool}
      />
    </div>
  );
}
