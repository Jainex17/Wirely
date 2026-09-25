"use client";

import type { ReactNode } from "react";
import {
  ChevronUp,
  Columns3,
  Contrast,
  Hand,
  LayoutGrid,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  Scan,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from "@/lib/canvasScene";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type CanvasBackground, useEditorStore } from "@/store/useEditorStore";

const BACKGROUND_LABELS: Record<CanvasBackground, string> = {
  dark: "Dark",
  gray: "Gray",
  light: "Light",
};

const menuTriggerClass =
  "flex h-8 items-center gap-0.5 rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground";

function RailButton({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

interface CanvasToolbarProps {
  activeTool: "select" | "grab";
  onToolChange: (tool: "select" | "grab") => void;
}

/** The floating tool bar at the bottom centre of the canvas. */
export default function CanvasToolbar({ activeTool, onToolChange }: CanvasToolbarProps) {
  const {
    canvasBackground,
    focusedPageId,
    setCanvasBackground,
    arrangePages,
    fitAllPages,
    fitPage,
  } = useEditorStore(
    useShallow((state) => ({
      canvasBackground: state.canvasBackground,
      focusedPageId: state.focusedPageId,
      setCanvasBackground: state.setCanvasBackground,
      arrangePages: state.arrangePages,
      fitAllPages: state.fitAllPages,
      fitPage: state.fitPage,
    })),
  );

  return (
    <div
      className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-sidebar p-1 shadow-xl"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <RailButton
        label="Move (V)"
        isActive={activeTool === "select"}
        onClick={() => onToolChange("select")}
      >
        <MousePointer2 className="h-4 w-4" />
      </RailButton>
      <RailButton
        label="Hand (H)"
        isActive={activeTool === "grab"}
        onClick={() => onToolChange("grab")}
      >
        <Hand className="h-4 w-4" />
      </RailButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger className={menuTriggerClass} aria-label="Arrange and zoom" title="Arrange and zoom">
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
      <DropdownMenu>
        <DropdownMenuTrigger
          className={menuTriggerClass}
          aria-label={`Canvas background: ${BACKGROUND_LABELS[canvasBackground]}`}
          title="Canvas background"
        >
          <Contrast className="h-4 w-4" />
          <ChevronUp className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" sideOffset={8} className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Canvas background</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={canvasBackground}
            onValueChange={(value) => setCanvasBackground(value as CanvasBackground)}
          >
            {(Object.keys(BACKGROUND_LABELS) as CanvasBackground[]).map((background) => (
              <DropdownMenuRadioItem key={background} value={background}>
                {BACKGROUND_LABELS[background]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Zoom out, zoom to fit, and zoom in, for the canvas's top-right corner. */
export function CanvasZoomControls() {
  const { zoom, stepZoom, fitAllPages } = useEditorStore(
    useShallow((state) => ({
      zoom: state.camera.zoom,
      stepZoom: state.stepZoom,
      fitAllPages: state.fitAllPages,
    })),
  );
  const buttonClass =
    "flex h-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="flex items-center rounded-lg border border-border bg-sidebar p-0.5 shadow-lg">
      <button
        type="button"
        onClick={() => stepZoom(-1)}
        disabled={zoom <= MIN_CANVAS_ZOOM}
        className={cn(buttonClass, "w-7")}
        aria-label="Zoom out (-)"
        title="Zoom out (-)"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={fitAllPages}
        className={cn(buttonClass, "min-w-12 px-1.5 text-xs font-medium tabular-nums text-foreground")}
        aria-label="Zoom to fit (Shift+1)"
        title="Zoom to fit (Shift+1)"
      >
        {Math.round(zoom)}%
      </button>
      <button
        type="button"
        onClick={() => stepZoom(1)}
        disabled={zoom >= MAX_CANVAS_ZOOM}
        className={cn(buttonClass, "w-7")}
        aria-label="Zoom in (+)"
        title="Zoom in (+)"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
