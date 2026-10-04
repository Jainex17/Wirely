"use client";

import React from "react";
import { createPortal } from "react-dom";
import { snapElementBox } from "@/lib/canvasDrag";
import type { SnapGuide } from "@/lib/canvasScene";
import type { ReportedNode } from "@/lib/nodePicker";
import { type CanvasDrop, findCanvasDrop, useDropIndicator } from "@/store/canvasDrop";

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
  | {
      kind: "move";
      drop: CanvasDrop | null;
      /** The element's box on screen when the gesture began, and the pointer then, for the ghost. */
      screen: { rect: DOMRect; pointer: Point; current: Point };
    }
  | { kind: "resize"; edge: ResizeEdge }
);

const GUIDE_LINE = "calc(1px * var(--canvas-inverse-zoom, 1))";

// A press that travels less than this in page px is a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

interface ElementEditLayerProps {
  pageId: string;
  node: ReportedNode;
  /** Maps a pointer's client position to page px inside the frame. */
  toPagePoint: (clientX: number, clientY: number) => Point;
  onPreviewStyle: (style: Record<string, string>) => void;
  onCommitStyle: (style: Record<string, string>) => void;
  /** A drop anywhere on the canvas. `copy` is true when Alt was held at release. */
  onDrop: (drop: CanvasDrop, copy: boolean) => void;
  /** A click that did not drag, passed through so a child can be picked. */
  onClick: (point: Point) => void;
  onDoubleClick: () => void;
}

/**
 * Handles on the picked element, in page px over the frame: drag it anywhere
 * on the canvas, into another element on this page or onto another page, and
 * hold Alt to copy it instead. An absolutely positioned element moves by its
 * offsets while it stays over its own page. Drag an edge or the corner to
 * resize it. Moves and resizes snap to the siblings' and parent's edges and
 * centers. Previews go to the frame as inline styles and the result is saved
 * on release.
 */
export default function ElementEditLayer({
  pageId,
  node,
  toPagePoint,
  onPreviewStyle,
  onCommitStyle,
  onDrop,
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
      return { style, guides };
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
    return { style, guides: snap.guides };
  };

  const setDrop = useDropIndicator((state) => state.setDrop);
  // Clears the drop line if the layer goes away mid drag.
  React.useEffect(() => () => setDrop(null), [setDrop]);

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

    const drop = findCanvasDrop(event.clientX, event.clientY, { pageId, nodeId: node.nodeId });
    const current = { x: event.clientX, y: event.clientY };
    // Over its own page, an absolute element moves by its offsets.
    if (layout?.isAbsolute && (!drop || drop.pageId === pageId)) {
      const { style, guides } = resolve(gesture, point);
      onPreviewStyle(style);
      setDrop(null);
      setGesture({ ...gesture, moved: true, guides, drop: null, screen: { ...gesture.screen, current } });
      return;
    }
    // Off its own page, an absolute element leaves its offsets behind.
    if (layout?.isAbsolute) onPreviewStyle({ left: "", top: "" });
    setDrop(drop);
    setGesture({ ...gesture, moved: true, guides: [], drop, screen: { ...gesture.screen, current } });
  };

  const handleUp = (event: React.PointerEvent) => {
    if (!gesture) return;
    setGesture(null);
    setDrop(null);
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
    if (gesture.drop) {
      onDrop(gesture.drop, event.altKey);
    } else if (layout?.isAbsolute) {
      onCommitStyle(resolve(gesture, point).style);
    }
  };

  const handleCancel = () => {
    if (!gesture) return;
    setGesture(null);
    setDrop(null);
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
            screen: {
              rect: event.currentTarget.getBoundingClientRect(),
              pointer: { x: event.clientX, y: event.clientY },
              current: { x: event.clientX, y: event.clientY },
            },
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
      {gesture?.kind === "move" && gesture.moved && gesture.drop
        ? // A ghost of the element follows the pointer across pages, so it
          // sits on the document, outside every page frame's clipping.
          createPortal(
            <div
              aria-hidden
              className="pointer-events-none fixed z-50 bg-sky-500/10 outline-dashed outline-1 outline-sky-500"
              style={{
                left: gesture.screen.rect.left + gesture.screen.current.x - gesture.screen.pointer.x,
                top: gesture.screen.rect.top + gesture.screen.current.y - gesture.screen.pointer.y,
                width: gesture.screen.rect.width,
                height: gesture.screen.rect.height,
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
