"use client";

import React from "react";
import { type DropTarget, findDropTarget } from "@/lib/canvasDrag";
import type { ReportedNode } from "@/lib/nodePicker";

type Point = { x: number; y: number };
type ResizeEdge = "right" | "bottom" | "corner";

type Gesture =
  | { kind: "move"; start: Point; moved: boolean; drop: DropTarget | null; offset: Point }
  | { kind: "resize"; edge: ResizeEdge; start: Point; size: { width: number; height: number } };

const THIN_LINE = "calc(2px * var(--canvas-inverse-zoom, 1))";

// A press that travels less than this in page px is a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

interface ElementEditLayerProps {
  node: ReportedNode;
  /** Maps a pointer's client position to page px inside the frame. */
  toPagePoint: (clientX: number, clientY: number) => Point;
  onPreviewStyle: (style: Record<string, string>) => void;
  onCommitStyle: (style: Record<string, string>) => void;
  onMove: (targetId: string, position: "before" | "after") => void;
  /** A click that did not drag, passed through so a child can be picked. */
  onClick: (point: Point) => void;
  onDoubleClick: () => void;
}

/**
 * Handles on the picked element, in page px over the frame: drag it to
 * reorder it among its siblings, or to move it when it is absolutely
 * positioned, and drag an edge or the corner to resize it. Previews go to the
 * frame as inline styles and the result is saved on release.
 */
export default function ElementEditLayer({
  node,
  toPagePoint,
  onPreviewStyle,
  onCommitStyle,
  onMove,
  onClick,
  onDoubleClick,
}: ElementEditLayerProps) {
  const [gesture, setGesture] = React.useState<Gesture | null>(null);
  const layout = node.layout;

  const begin = (event: React.PointerEvent, next: Gesture) => {
    if (event.button !== 0) return;
    // Keeps the canvas from dragging the whole page.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture(next);
  };

  const handleMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const point = toPagePoint(event.clientX, event.clientY);
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    if (gesture.kind === "resize") {
      const style: Record<string, string> = {};
      if (gesture.edge !== "bottom") style.width = `${Math.max(1, Math.round(gesture.size.width + dx))}px`;
      if (gesture.edge !== "right") style.height = `${Math.max(1, Math.round(gesture.size.height + dy))}px`;
      onPreviewStyle(style);
      return;
    }

    if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (layout?.isAbsolute) {
      onPreviewStyle({
        left: `${Math.round(layout.left + dx)}px`,
        top: `${Math.round(layout.top + dy)}px`,
      });
      setGesture({ ...gesture, moved: true, offset: { x: dx, y: dy } });
      return;
    }
    const drop = layout ? findDropTarget(layout.siblings, node.nodeId, layout.axis, point) : null;
    setGesture({ ...gesture, moved: true, drop, offset: { x: dx, y: dy } });
  };

  const handleUp = (event: React.PointerEvent) => {
    if (!gesture) return;
    setGesture(null);
    const point = toPagePoint(event.clientX, event.clientY);
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;

    if (gesture.kind === "resize") {
      const style: Record<string, string> = {};
      if (gesture.edge !== "bottom") style.width = `${Math.max(1, Math.round(gesture.size.width + dx))}px`;
      if (gesture.edge !== "right") style.height = `${Math.max(1, Math.round(gesture.size.height + dy))}px`;
      onCommitStyle(style);
      return;
    }
    if (!gesture.moved) {
      onClick(point);
      return;
    }
    if (layout?.isAbsolute) {
      onCommitStyle({
        left: `${Math.round(layout.left + dx)}px`,
        top: `${Math.round(layout.top + dy)}px`,
      });
    } else if (gesture.drop) {
      onMove(gesture.drop.targetId, gesture.drop.position);
    }
  };

  const handleCancel = () => {
    if (!gesture) return;
    setGesture(null);
    // Puts back whatever the preview changed.
    if (gesture.kind === "resize") onPreviewStyle({ width: "", height: "" });
    else if (layout?.isAbsolute) onPreviewStyle({ left: "", top: "" });
  };

  const handle = (edge: ResizeEdge, className: string) => (
    <div
      aria-hidden
      className={`pointer-events-auto absolute h-2 w-2 rounded-[1px] border border-sky-500 bg-white ${className}`}
      style={{ transform: "translate(-50%, -50%) scale(var(--canvas-inverse-zoom, 1))" }}
      onPointerDown={(event) =>
        begin(event, {
          kind: "resize",
          edge,
          start: toPagePoint(event.clientX, event.clientY),
          size: { width: node.width, height: node.height },
        })
      }
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleCancel}
    />
  );

  const isMoving = gesture?.kind === "move" && gesture.moved;

  return (
    <>
      <div
        className={`absolute z-30 ${isMoving ? "cursor-grabbing" : "cursor-move"}`}
        style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        onPointerDown={(event) =>
          begin(event, {
            kind: "move",
            start: toPagePoint(event.clientX, event.clientY),
            moved: false,
            drop: null,
            offset: { x: 0, y: 0 },
          })
        }
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleCancel}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick();
        }}
      >
        {node.isSvg ? null : (
          <>
            {handle("right", "left-full top-1/2 cursor-ew-resize")}
            {handle("bottom", "left-1/2 top-full cursor-ns-resize")}
            {handle("corner", "left-full top-full cursor-nwse-resize")}
          </>
        )}
      </div>
      {gesture?.kind === "move" && gesture.moved && !layout?.isAbsolute ? (
        <>
          {/* A ghost of the element follows the pointer while it reorders. */}
          <div
            aria-hidden
            className="pointer-events-none absolute z-30 bg-sky-500/10 outline-dashed outline-sky-500"
            style={{
              left: node.x + gesture.offset.x,
              top: node.y + gesture.offset.y,
              width: node.width,
              height: node.height,
              outlineWidth: "calc(1px * var(--canvas-inverse-zoom, 1))",
            }}
          />
          {gesture.drop ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-30 bg-sky-500"
              style={{
                left: gesture.drop.line.x,
                top: gesture.drop.line.y,
                // The line's thin side stays 2 screen px at any zoom.
                width: gesture.drop.line.width <= 2 ? THIN_LINE : gesture.drop.line.width,
                height: gesture.drop.line.height <= 2 ? THIN_LINE : gesture.drop.line.height,
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
