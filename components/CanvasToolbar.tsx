"use client";

import { Hand, Minus, MousePointer2, Plus } from "lucide-react";

interface CanvasToolbarProps {
  activeTool: "select" | "grab";
  onToolChange: (tool: "select" | "grab") => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onReset: () => void;
}

export default function CanvasToolbar({
  activeTool,
  onToolChange,
  zoom,
  onZoomChange,
  onReset,
}: CanvasToolbarProps) {
  const zoomLevels = [2, 5, 10, 25, 50, 75, 100, 125, 150, 200];

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
          onClick={() => onToolChange("select")}
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
          onClick={() => onToolChange("grab")}
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
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= zoomLevels[0]}
          className="p-1.5 text-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onReset}
          className="min-w-13 px-2 py-1 text-sm font-medium text-foreground hover:text-foreground hover:bg-accent rounded transition-colors text-center"
          title="Reset zoom"
        >
          {Math.round(zoom)}%
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= zoomLevels[zoomLevels.length - 1]}
          className="px-2 py-1 text-xs font-medium text-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
