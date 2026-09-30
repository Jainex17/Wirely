"use client";

import React from "react";
import type { ReportedNode } from "@/lib/nodePicker";
import { getNodeAttribute, setNodeAttribute, stampNodeIds } from "@/lib/pageNodes";
import { scaleFromZoom } from "@/lib/canvasScene";
import { appendToArtboard, getArtboardMatrix } from "@/lib/vectorArtboard";
import {
  applyMatrix,
  buildPenPath,
  type ControlKey,
  invertMatrix,
  type Matrix,
  moveAnchor,
  moveControl,
  parsePath,
  type PenAnchor,
  type Point,
  type Segment,
  serializePath,
} from "@/lib/vectorPath";
import { useEditorStore } from "@/store/useEditorStore";

const ACCENT = "#0ea5e9";
// Screen px. Divided by the canvas scale so handles stay one size at any zoom.
const HANDLE_RADIUS = 4;
const CLOSE_DISTANCE = 8;
const DRAG_THRESHOLD = 2;

type Drag =
  | { kind: "anchor"; index: number; start: Point; snapshot: Segment[] }
  | { kind: "control"; index: number; key: ControlKey; snapshot: Segment[] };

interface VectorEditLayerProps {
  /** The page's stored HTML. Edits apply to the stamped copy the frame shows. */
  html: string;
  width: number;
  height: number;
  isPenMode: boolean;
  /** The picked element on this page, when there is one. */
  selected: ReportedNode | null;
  onPreviewPath: (nodeId: string, d: string) => void;
  onCommit: (html: string) => void;
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

const toTransform = (matrix: Matrix) => `matrix(${matrix.join(" ")})`;

/** Each anchor with the point before it, which a C segment's first control hangs off. */
const describeHandles = (segments: Segment[]) => {
  const handles: Array<{ index: number; from: Point; segment: Exclude<Segment, { type: "Z" }> }> = [];
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  segments.forEach((segment, index) => {
    if (segment.type === "Z") {
      current = start;
      return;
    }
    handles.push({ index, from: current, segment });
    if (segment.type === "M") start = segment.to;
    current = segment.to;
  });
  return handles;
};

/**
 * The pen tool and path editing on a vector page. Drawn over the sandboxed
 * frame in page px, from geometry parsed out of the page source, so nothing
 * from the page itself renders in the editor's origin.
 *
 * With a path picked, its anchors and bezier handles can be dragged, and
 * Delete removes the picked element. With the pen, a click places a corner, a
 * drag places a smooth point, a click on the first point closes the shape, and
 * Enter or Escape ends an open one.
 */
export default function VectorEditLayer({
  html,
  width,
  height,
  isPenMode,
  selected,
  onPreviewPath,
  onCommit,
}: VectorEditLayerProps) {
  const zoom = useEditorStore((state) => state.camera.zoom);
  const unit = 1 / scaleFromZoom(zoom);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const source = React.useMemo(() => stampNodeIds(html), [html]);
  const pathMatrix = selected?.tag === "path" ? selected.matrix : null;
  const pathInverse = React.useMemo(() => (pathMatrix ? invertMatrix(pathMatrix) : null), [pathMatrix]);
  const baseSegments = React.useMemo(() => {
    if (!selected || !pathMatrix) return null;
    const d = getNodeAttribute(source, selected.nodeId, "d");
    return d ? parsePath(d) : null;
  }, [pathMatrix, selected, source]);
  const [draft, setDraft] = React.useState<Segment[] | null>(null);
  const segments = draft ?? baseSegments;
  const dragRef = React.useRef<Drag | null>(null);

  const artboard = React.useMemo(() => getArtboardMatrix(html), [html]);
  const artboardInverse = React.useMemo(() => invertMatrix(artboard), [artboard]);
  const [anchors, setAnchors] = React.useState<PenAnchor[]>([]);
  const [hover, setHover] = React.useState<Point | null>(null);
  const penDragRef = React.useRef<Point | null>(null);

  const toPage = (event: React.PointerEvent): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    const ratio = rect && rect.width > 0 ? width / rect.width : 1;
    return {
      x: (event.clientX - (rect?.left ?? 0)) * ratio,
      y: (event.clientY - (rect?.top ?? 0)) * ratio,
    };
  };

  const finishPen = React.useCallback(
    (closed: boolean) => {
      setAnchors([]);
      setHover(null);
      penDragRef.current = null;
      if (anchors.length < 2) return;
      const strokeWidth = Math.round((2 / Math.abs(artboard[0] || 1)) * 100) / 100;
      const next = appendToArtboard(
        source,
        `<path d="${buildPenPath(anchors, closed)}" fill="none" stroke="#18181b" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      if (next) onCommit(next);
    },
    [anchors, artboard, onCommit, source],
  );

  // Leaving the pen drops a path still being drawn.
  React.useEffect(() => {
    if (!isPenMode) {
      setAnchors([]);
      setHover(null);
    }
  }, [isPenMode]);

  // Delete for a picked shape is the editor's global shortcut.
  React.useEffect(() => {
    if (anchors.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        finishPen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [anchors.length, finishPen]);

  const startDrag = (event: React.PointerEvent<SVGElement>, drag: Drag) => {
    if (event.button !== 0 || !segments) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = drag;
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isPenMode || event.button !== 0 || !artboardInverse) return;
    event.stopPropagation();
    const pagePoint = toPage(event);
    const first = anchors[0];
    if (first && anchors.length > 2) {
      const firstOnPage = applyMatrix(artboard, first);
      if (Math.hypot(firstOnPage.x - pagePoint.x, firstOnPage.y - pagePoint.y) <= CLOSE_DISTANCE * unit) {
        finishPen(true);
        return;
      }
    }
    const point = applyMatrix(artboardInverse, pagePoint);
    event.currentTarget.setPointerCapture(event.pointerId);
    penDragRef.current = pagePoint;
    // The rubber band hides while a point is placed and comes back on the next move.
    setHover(null);
    setAnchors((current) => [...current, point]);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pagePoint = toPage(event);
    const drag = dragRef.current;
    if (drag && pathInverse && selected) {
      const point = applyMatrix(pathInverse, pagePoint);
      const next =
        drag.kind === "anchor"
          ? moveAnchor(drag.snapshot, drag.index, point.x - drag.start.x, point.y - drag.start.y)
          : moveControl(drag.snapshot, drag.index, drag.key, point);
      setDraft(next);
      onPreviewPath(selected.nodeId, serializePath(next));
      return;
    }
    if (!isPenMode || !artboardInverse) return;
    const point = applyMatrix(artboardInverse, pagePoint);
    const pressedAt = penDragRef.current;
    if (!pressedAt) {
      setHover(point);
      return;
    }
    if (Math.hypot(pagePoint.x - pressedAt.x, pagePoint.y - pressedAt.y) < DRAG_THRESHOLD * unit) return;
    setAnchors((current) =>
      current.length === 0
        ? current
        : [...current.slice(0, -1), { ...current[current.length - 1], handle: point }],
    );
  };

  const handlePointerUp = () => {
    penDragRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !draft || !selected) return;
    const next = setNodeAttribute(source, selected.nodeId, "d", serializePath(draft));
    setDraft(null);
    if (next) onCommit(next);
  };

  const radius = HANDLE_RADIUS * unit;
  const lineWidth = 1.5 * unit;
  const pathHandles = segments && pathMatrix ? describeHandles(segments) : [];
  const onPath = (point: Point) => (pathMatrix ? applyMatrix(pathMatrix, point) : point);
  const penPreview = hover ? [...anchors, hover] : anchors;

  const controlHandle = (index: number, key: ControlKey, anchor: Point, control: Point) => {
    const at = onPath(control);
    const from = onPath(anchor);
    return (
      <g key={`${index}-${key}`}>
        <line x1={from.x} y1={from.y} x2={at.x} y2={at.y} stroke={ACCENT} strokeWidth={lineWidth} />
        <circle
          cx={at.x}
          cy={at.y}
          r={radius * 0.85}
          fill={ACCENT}
          style={{ pointerEvents: "auto", cursor: "move" }}
          onPointerDown={(event) =>
            segments && startDrag(event, { kind: "control", index, key, snapshot: segments })
          }
        />
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      className="absolute left-0 top-0 z-20 overflow-visible"
      width={width}
      height={height}
      style={{ pointerEvents: isPenMode ? "auto" : "none", cursor: isPenMode ? "crosshair" : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHover(null)}
    >
      {segments && pathMatrix ? (
        <>
          <path
            d={serializePath(segments)}
            transform={toTransform(pathMatrix)}
            fill="none"
            stroke={ACCENT}
            strokeWidth={lineWidth}
            vectorEffect="non-scaling-stroke"
          />
          {pathHandles.map(({ index, from, segment }) => (
            <React.Fragment key={index}>
              {segment.type === "C" ? controlHandle(index, "c1", from, segment.c1) : null}
              {segment.type === "C" ? controlHandle(index, "c2", segment.to, segment.c2) : null}
              {segment.type === "Q" ? controlHandle(index, "c", segment.to, segment.c) : null}
            </React.Fragment>
          ))}
          {pathHandles.map(({ index, segment }) => {
            const at = onPath(segment.to);
            return (
              <rect
                key={`anchor-${index}`}
                x={at.x - radius}
                y={at.y - radius}
                width={radius * 2}
                height={radius * 2}
                fill="white"
                stroke={ACCENT}
                strokeWidth={lineWidth}
                style={{ pointerEvents: "auto", cursor: "move" }}
                onPointerDown={(event) =>
                  segments &&
                  pathInverse &&
                  startDrag(event, {
                    kind: "anchor",
                    index,
                    start: applyMatrix(pathInverse, toPage(event)),
                    snapshot: segments,
                  })
                }
              />
            );
          })}
        </>
      ) : null}
      {penPreview.length > 0 ? (
        <>
          <path
            d={buildPenPath(penPreview, false)}
            transform={toTransform(artboard)}
            fill="none"
            stroke={ACCENT}
            strokeWidth={lineWidth}
            vectorEffect="non-scaling-stroke"
          />
          {anchors.map((anchor, index) => {
            const at = applyMatrix(artboard, anchor);
            const handle = anchor.handle ? applyMatrix(artboard, anchor.handle) : null;
            return (
              <g key={index}>
                {handle ? (
                  <line
                    x1={2 * at.x - handle.x}
                    y1={2 * at.y - handle.y}
                    x2={handle.x}
                    y2={handle.y}
                    stroke={ACCENT}
                    strokeWidth={lineWidth}
                  />
                ) : null}
                <circle
                  cx={at.x}
                  cy={at.y}
                  r={index === 0 && anchors.length > 2 ? radius * 1.4 : radius}
                  fill="white"
                  stroke={ACCENT}
                  strokeWidth={lineWidth}
                />
              </g>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}
