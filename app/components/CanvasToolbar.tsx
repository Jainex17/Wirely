"use client";

import { useState } from "react";
import { Hand, MousePointer2 } from "lucide-react";

interface CanvasToolbarProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}

export default function CanvasToolbar({
  zoom,
  onZoomChange,
  onReset,
}: CanvasToolbarProps) {
  const [activeTool, setActiveTool] = useState<"select" | "grab">("select");
  const zoomLevels = [5, 10, 25, 50, 75, 100, 125, 150, 200];

  const handleZoomIn = () => {
    const currentIndex = zoomLevels.findIndex((level) => level > zoom);
    if (currentIndex !== -1) {
      onZoomChange(zoomLevels[currentIndex]);
    } else {
      onZoomChange(zoomLevels[zoomLevels.length - 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = zoomLevels.findIndex((level) => level >= zoom);
    if (currentIndex > 0) {
      onZoomChange(zoomLevels[currentIndex - 1]);
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-secondary rounded-[var(--radius)] border border-border p-1 z-20">
      <div className="flex items-center gap-1 px-1">
        <button
          onClick={() => setActiveTool("select")}
          className={`p-1.5 rounded transition-colors ${
            activeTool === "select"
              ? "bg-accent text-foreground"
              : "text-foreground hover:bg-accent"
          }`}
          title="Select tool"
        >
          <MousePointer2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setActiveTool("grab")}
          className={`p-1.5 rounded transition-colors ${
            activeTool === "grab"
              ? "bg-accent text-foreground"
              : "text-foreground hover:bg-accent"
          }`}
          title="Grab tool"
        >
          <Hand className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-6 w-px bg-border/70" />

      <div className="flex items-center gap-1 px-2">
        <button
          onClick={handleZoomOut}
          disabled={zoom <= zoomLevels[0]}
          className="p-1.5 text-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 12H4"
            />
          </svg>
        </button>

        <button
          onClick={onReset}
          className="min-w-13 px-2 py-1 text-sm font-medium text-foreground hover:text-foreground hover:bg-accent rounded transition-colors text-center"
          title="Reset zoom"
        >
          {Math.round(zoom)}%
        </button>

        <button
          onClick={handleZoomIn}
          disabled={zoom >= zoomLevels[zoomLevels.length - 1]}
          className="p-1.5 text-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
