"use client";

import {
  useEffect,
  useRef,
  useCallback,
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { useEditorStore } from "../store/useEditorStore";
import Canvas from "./Canvas";
import PagePreviewModal from "./PagePreviewModal";

const MIN_ZOOM = 5;
const MAX_ZOOM = 200;

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  promptPrefill?: string;
}

export default function EditorWorkspace({
  sidebarMode = "default",
  promptPrefill,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  const {
    zoom,
    panOffset,
    activeDevice,
    setZoom,
    setPanOffset,
    setSelectedSection,
    renamePage,
    deletePage,
    pages,
  } = useEditorStore();

  const handleZoomChange = useCallback(
    (newZoom: number) => {
      setZoom(Math.min(Math.max(newZoom, MIN_ZOOM), MAX_ZOOM));
    },
    [setZoom],
  );

  const handleReset = useCallback(() => {
    setZoom(11);
    setPanOffset({ x: 0, y: 0 });
  }, [setZoom, setPanOffset]);

  const handleCanvasClick = useCallback(() => {
    setSelectedSection(null);
  }, [setSelectedSection]);

  const handlePreviewPage = useCallback((pageId: string) => {
    setPreviewPageId(pageId);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewPageId(null);
  }, []);

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
        const zoomFactor = 1 + delta * 0.001;
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

  return (
    <div data-sidebar-mode={sidebarMode} className="relative w-full h-full">
      <Canvas
        canvasRef={canvasRef}
        panOffset={panOffset}
        zoom={zoom}
        activeDevice={activeDevice}
        onCanvasClick={handleCanvasClick}
        onRenamePage={renamePage}
        onDeletePage={deletePage}
        onPreviewPage={handlePreviewPage}
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
