"use client";

import { memo } from "react";
import {
  ChevronUp,
  Columns3,
  Frame,
  Hand,
  LayoutGrid,
  Maximize,
  MessageCircle,
  MousePointer2,
  PenTool,
  Scan,
  Square,
  SquareDashedMousePointer,
  Type,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import {
  CanvasBackgroundMenu,
  menuTriggerClass,
  ToolbarDivider,
  ToolButton,
  toolbarClass,
  ZoomControls,
} from "@/components/EditorChrome";
import { type CanvasTool, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "@/lib/canvasScene";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { focusedPageId, arrangePages, fitAllPages, fitPage } = useEditorStore(
    useShallow((state) => ({
      focusedPageId: state.focusedPageId,
      arrangePages: state.arrangePages,
      fitAllPages: state.fitAllPages,
      fitPage: state.fitPage,
    })),
  );

  return (
    <div
      className={toolbarClass}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <ToolButton
        label="Move (V)"
        detail="Select pages and drag them around"
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
        detail="Pick an element inside a page to edit or prompt on it"
        isActive={activeTool === "element"}
        onClick={() => onToolChange("element")}
      >
        <SquareDashedMousePointer className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Pen (P)"
        detail="Draw a vector path on a page"
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
        detail="Click in a page to add a frame"
        isActive={activeTool === "frame"}
        onClick={() => onToolChange("frame")}
      >
        <Frame className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Rectangle (R)"
        detail="Click in a page to add a box"
        isActive={activeTool === "rectangle"}
        onClick={() => onToolChange("rectangle")}
      >
        <Square className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="Text (T)"
        detail="Click in a page to add text"
        isActive={activeTool === "text"}
        onClick={() => onToolChange("text")}
      >
        <Type className="h-4 w-4" />
      </ToolButton>
      <ToolbarDivider />
      <DropdownMenu>
        <DropdownMenuTrigger className={menuTriggerClass} aria-label="Arrange and zoom"
          data-tip-detail="Line pages up in a row or grid, or fit them in view">
          <LayoutGrid className="h-4 w-4" />
          <ChevronUp className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Arrange pages</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => arrangePages("row")}>
            <Columns3 className="h-4 w-4" />
            In a row
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => arrangePages("grid")}>
            <LayoutGrid className="h-4 w-4" />
            In a grid
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Zoom</DropdownMenuLabel>
          <DropdownMenuItem onSelect={fitAllPages}>
            <Maximize className="h-4 w-4" />
            Fit all pages
            <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!focusedPageId}
            onSelect={() => {
              if (focusedPageId) fitPage(focusedPageId);
            }}
          >
            <Scan className="h-4 w-4" />
            Fit selected page
            <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CanvasBackgroundMenu />
    </div>
  );
});

/** The zoom controls for the Prototype canvas's top-right corner. */
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
