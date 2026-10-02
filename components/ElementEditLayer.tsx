"use client";

import React from "react";
import { type DropTarget, findDropTarget, snapElementBox } from "@/lib/canvasDrag";
import type { SnapGuide } from "@/lib/canvasScene";
import type { ReportedNode } from "@/lib/nodePicker";

type Point = { x: number; y: number };
type ResizeEdge = "right" | "bottom" | "corner";

type Gesture = {
  start: Point;
  /**
   * The element's box and left/top when the gesture began. Each preview makes
   * the frame report the element again, so the live node has already moved.
   */
  origin: { x: number; y: number; width: number; height: number; left: number; top: number };
  /** Screen px per page px when the gesture began, for the snap distance. */
  scale: number;
  guides: SnapGuide[];
  /** Past the drag threshold. Until then a release is a click and changes nothing. */
  moved: boolean;
} & (
  | { kind: "move"; drop: DropTarget | null; offset: Point }
  | { kind: "resize"; edge: ResizeEdge }
);

const THIN_LINE = "calc(2px * var(--canvas-inverse-zoom, 1))";
const GUIDE_LINE = "calc(1px * var(--canvas-inverse-zoom, 1))";

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
 * positioned, and drag an edge or the corner to resize it. Moves and resizes
 * snap to the siblings' and parent's edges and centers. Previews go to the
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
  // Mirrors `gesture.moved` without waiting for a render, so a release right
  // after the first preview still saves it.
  const movedRef = React.useRef(false);
  const layout = node.layout;

  const begin = (event: React.PointerEvent, next: Gesture) => {
    if (event.button !== 0) return;
    // Keeps the canvas from dragging the whole page.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    movedRef.current = false;
    setGesture(next);
  };

  const startOf = (event: React.PointerEvent) => {
    const start = toPagePoint(event.clientX, event.clientY);
    const span = toPagePoint(event.clientX + 100, event.clientY).x - start.x;
    return {
      start,
      origin: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        left: layout?.left ?? 0,
        top: layout?.top ?? 0,
      },
      scale: span > 0 ? 100 / span : 1,
      guides: [],
      moved: false,
    };
  };

  /** The snapped style for a resize or absolute move to this point. */
  const resolve = (current: Gesture, point: Point) => {
    const { origin } = current;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (current.kind === "resize") {
      const useX = current.edge !== "bottom";
      const useY = current.edge !== "right";
      // The dragged corner snaps as a point.
      const snap = layout
        ? snapElementBox(
            { x: origin.x + origin.width + dx, y: origin.y + origin.height + dy, width: 0, height: 0 },
            node.nodeId,
            layout,
            current.scale,
          )
        : { dx: 0, dy: 0, guides: [] };
      const style: Record<string, string> = {};
      if (useX) style.width = `${Math.max(1, Math.round(origin.width + dx + snap.dx))}px`;
      if (useY) style.height = `${Math.max(1, Math.round(origin.height + dy + snap.dy))}px`;
      const guides = snap.guides.filter((guide) =>
        guide.orientation === "vertical" ? useX : useY,
      );
      return { style, guides, offset: { x: dx, y: dy } };
    }
    const snap = layout
      ? snapElementBox(
          { x: origin.x + dx, y: origin.y + dy, width: origin.width, height: origin.height },
          node.nodeId,
          layout,
          current.scale,
        )
      : { dx: 0, dy: 0, guides: [] };
    const offset = { x: dx + snap.dx, y: dy + snap.dy };
    const style = {
      left: `${Math.round(origin.left + offset.x)}px`,
      top: `${Math.round(origin.top + offset.y)}px`,
    };
    return { style, guides: snap.guides, offset };
  };

  const handleMove = (event: React.PointerEvent) => {
    if (!gesture) return;
    const point = toPagePoint(event.clientX, event.clientY);
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    movedRef.current = true;

    if (gesture.kind === "resize") {
      const { style, guides } = resolve(gesture, point);
      onPreviewStyle(style);
      setGesture({ ...gesture, moved: true, guides });
      return;
    }

    if (layout?.isAbsolute) {
      const { style, guides, offset } = resolve(gesture, point);
      onPreviewStyle(style);
      setGesture({ ...gesture, moved: true, offset, guides });
      return;
    }
    const drop = layout ? findDropTarget(layout.siblings, node.nodeId, layout.axis, point) : null;
    setGesture({ ...gesture, moved: true, drop, offset: { x: dx, y: dy } });
  };

  const handleUp = (event: React.PointerEvent) => {
    if (!gesture) return;
    setGesture(null);
    const point = toPagePoint(event.clientX, event.clientY);
    const moved = gesture.moved || movedRef.current;

    if (gesture.kind === "resize") {
      if (moved) onCommitStyle(resolve(gesture, point).style);
      return;
    }
    if (!moved) {
      onClick(point);
      return;
    }
    if (layout?.isAbsolute) {
      onCommitStyle(resolve(gesture, point).style);
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
          ...startOf(event),
          kind: "resize",
          edge,
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
            ...startOf(event),
            kind: "move",
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
      {gesture?.guides.map((guide) => (
        <div
          key={`${guide.orientation}:${guide.position}`}
          aria-hidden
          className="pointer-events-none absolute z-30 bg-rose-500"
          style={
            guide.orientation === "vertical"
              ? { left: guide.position, top: guide.start, width: GUIDE_LINE, height: guide.end - guide.start }
              : { left: guide.start, top: guide.position, width: guide.end - guide.start, height: GUIDE_LINE }
          }
        />
      ))}
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
