"use client";

import { memo } from "react";
import {
  Circle,
  Frame,
  Hand,
  MessageCircle,
  MousePointer2,
  PenTool,
  Square,
  SquareDashedMousePointer,
  Type,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  CanvasBackgroundMenu,
  ToolbarDivider,
  ToolButton,
  toolbarClass,
  ZoomControls,
} from "@/components/EditorChrome";
import { type CanvasTool, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "@/lib/canvasScene";
import { useEditorStore } from "@/store/useEditorStore";

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}

/**
 * The floating tool bar at the bottom centre of the canvas. Memoized because
 * the canvas re-renders on every pan frame and these props rarely change.
 */
export default memo(function CanvasToolbar({ activeTool, onToolChange }: CanvasToolbarProps) {
  return (
    <div
      className={toolbarClass}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ToolButton
        label="Move (V)"
        detail="Select frames and drag them around"
        isActive={activeTool === "select"}
        onClick={() => onToolChange("select")}
      >
        <MousePointer2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Hand (H)"
        detail="Pan the canvas. Hold Space for the same."
        isActive={activeTool === "grab"}
        onClick={() => onToolChange("grab")}
      >
        <Hand className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Element (E)"
        detail="Pick an element inside a frame to edit or prompt on it"
        isActive={activeTool === "element"}
        onClick={() => onToolChange("element")}
      >
        <SquareDashedMousePointer className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Pen (P)"
        detail="Draw a vector path on a frame"
        isActive={activeTool === "pen"}
        onClick={() => onToolChange("pen")}
      >
        <PenTool className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Comment (C)"
        detail="Click an element to leave a comment on it"
        isActive={activeTool === "comment"}
        onClick={() => onToolChange("comment")}
      >
        <MessageCircle className="h-4 w-4" />
      </ToolButton>
      <ToolbarDivider />
      <ToolButton
        label="Frame (F)"
        detail="Click in a frame to add a frame"
        isActive={activeTool === "frame"}
        onClick={() => onToolChange("frame")}
      >
        <Frame className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Square (R)"
        detail="Click in a frame to add a square"
        isActive={activeTool === "square"}
        onClick={() => onToolChange("square")}
      >
        <Square className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Circle (O)"
        detail="Click in a frame to add a circle"
        isActive={activeTool === "circle"}
        onClick={() => onToolChange("circle")}
      >
        <Circle className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Text (T)"
        detail="Click in a frame to add text"
        isActive={activeTool === "text"}
        onClick={() => onToolChange("text")}
      >
        <Type className="h-4 w-4" />
      </ToolButton>
      <ToolbarDivider />
      <CanvasBackgroundMenu />
    </div>
  );
});

/** The zoom controls for the Pages canvas's top-right corner. */
export function CanvasZoomControls() {
  const { zoom, stepZoom, fitAllPages } = useEditorStore(
    useShallow((state) => ({
      zoom: state.camera.zoom,
      stepZoom: state.stepZoom,
      fitAllPages: state.fitAllPages,
    })),
  );
  return (
    <ZoomControls
      zoom={zoom}
      canZoomOut={zoom > MIN_CANVAS_ZOOM}
      canZoomIn={zoom < MAX_CANVAS_ZOOM}
      onZoomOut={() => stepZoom(-1)}
      onFit={fitAllPages}
      onZoomIn={() => stepZoom(1)}
    />
  );
}
