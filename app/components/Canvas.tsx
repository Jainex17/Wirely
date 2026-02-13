"use client";

import { useEditorStore } from "../store/useEditorStore";
import CanvasToolbar from "./CanvasToolbar";
import PageRenderer from "./PageRenderer";

const DEVICE_DIMENSIONS = {
  desktop: { width: 1440, height: 900, label: "Desktop" },
  tablet: { width: 768, height: 1024, label: "Tablet" },
  mobile: { width: 375, height: 812, label: "Mobile" },
} as const;

interface CanvasProps {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  panOffset: { x: number; y: number };
  zoom: number;
  activeDevice: keyof typeof DEVICE_DIMENSIONS;
  onCanvasClick: () => void;
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onAddPage: (afterPageId: string) => void;
  onPreviewPage: (pageId: string) => void;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}

export default function Canvas({
  canvasRef,
  panOffset,
  zoom,
  activeDevice,
  onCanvasClick,
  onRenamePage,
  onDeletePage,
  onAddPage,
  onPreviewPage,
  onZoomChange,
  onReset,
}: CanvasProps) {
  const pages = useEditorStore((state) => state.pages);
  const currentDevice = DEVICE_DIMENSIONS[activeDevice];

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden select-none"
      onClick={onCanvasClick}
    >
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
        <div
          className="flex flex-row"
          style={{
            gap: "120px",
            marginLeft: `-${(pages.length * (currentDevice.width + 120)) / 2}px`,
          }}
        >
          {pages.length === 0 ? null : (
            pages.map((page) => (
              <PageRenderer
                key={page.id}
                page={page}
                onRenamePage={onRenamePage}
                onDeletePage={onDeletePage}
                onAddPage={onAddPage}
                onPreviewPage={onPreviewPage}
                currentDevice={currentDevice}
              />
            ))
          )}
        </div>
      </div>
      <CanvasToolbar
        zoom={zoom}
        onZoomChange={onZoomChange}
        onReset={onReset}
      />
    </div>
  );
}
