/**
 * Where a dragged element would land among its siblings on the canvas, the
 * way Figma reorders inside auto layout: the sibling nearest the pointer, then
 * before or after it by which half of it the pointer is over. Works for rows,
 * columns, wrapped rows, and grids alike.
 */
import type { NodeBox } from "@/lib/nodePicker";

export interface DropTarget {
  targetId: string;
  position: "before" | "after";
  /** The insertion line to draw, in page px. */
  line: { x: number; y: number; width: number; height: number };
}

const LINE_PX = 2;

export const findDropTarget = (
  siblings: NodeBox[],
  selfId: string,
  axis: "row" | "column",
  point: { x: number; y: number },
): DropTarget | null => {
  const selfIndex = siblings.findIndex((box) => box.nodeId === selfId);
  let nearest: NodeBox | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const box of siblings) {
    if (box.nodeId === selfId) continue;
    const distance = Math.hypot(
      point.x - (box.x + box.width / 2),
      point.y - (box.y + box.height / 2),
    );
    if (distance < nearestDistance) {
      nearest = box;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;

  const isRow = axis === "row";
  const center = isRow ? nearest.x + nearest.width / 2 : nearest.y + nearest.height / 2;
  const position = (isRow ? point.x : point.y) < center ? "before" : "after";

  // Dropping just before the next sibling or just after the previous one
  // leaves the element where it is.
  const nearestIndex = siblings.indexOf(nearest);
  if (
    (position === "before" && nearestIndex === selfIndex + 1) ||
    (position === "after" && nearestIndex === selfIndex - 1)
  ) {
    return null;
  }

  const edge = position === "before" ? 0 : 1;
  const line = isRow
    ? {
        x: nearest.x + nearest.width * edge - LINE_PX / 2,
        y: nearest.y,
        width: LINE_PX,
        height: nearest.height,
      }
    : {
        x: nearest.x,
        y: nearest.y + nearest.height * edge - LINE_PX / 2,
        width: nearest.width,
        height: LINE_PX,
      };
  return { targetId: nearest.nodeId, position, line };
};
