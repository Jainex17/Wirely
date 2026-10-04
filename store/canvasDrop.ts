/**
 * Dragging an element across the whole canvas, into any page, the way a design
 * tool lets a layer leave its frame. Each page registers the inert DOM the
 * canvas drew it as, and `findCanvasDrop` reads those boxes to answer where a
 * pointer would drop: which page, which element, and before, after, or inside
 * it. The answer is drawn by the page it lands on, through `useDropIndicator`.
 */
import { create } from "zustand";
import { findDropTarget } from "@/lib/canvasDrag";
import { INERT_BODY_ATTRIBUTE } from "@/lib/inertCss";
import type { InertFrame } from "@/lib/inertPicker";
import { NODE_ID_ATTRIBUTE } from "@/lib/pageNodes";
import type { DropTarget, InsertPosition } from "@/lib/pageTree";

interface CanvasFrame {
  frame: InertFrame;
  /** A vector page is one SVG artboard, which page markup cannot go into. */
  isVector: boolean;
}

const frames = new Map<string, CanvasFrame>();

/** Records the inert DOM a page is drawn as, or forgets it with null. */
export const registerCanvasFrame = (pageId: string, frame: CanvasFrame | null) => {
  if (frame) frames.set(pageId, frame);
  else frames.delete(pageId);
};

export const getCanvasFrame = (pageId: string) => frames.get(pageId)?.frame ?? null;

type Box = { x: number; y: number; width: number; height: number };

export interface CanvasDrop {
  pageId: string;
  target: DropTarget;
  /** What to draw, in the target page's px: a line between elements, or a box to drop into. */
  indicator: Box & { kind: "line" | "box" };
}

const LINE_PX = 2;
// The share of a container's length, at each end along its parent's axis,
// that drops beside it rather than into it. A share, not px, so it works at
// any zoom.
const EDGE_BAND = 0.25;
const VOID_TAGS = new Set(["img", "input", "hr", "br", "video", "canvas", "iframe", "textarea", "select"]);

const isRowLayout = (element: Element | null) => {
  if (!element) return false;
  const style = getComputedStyle(element);
  return (style.display.includes("flex") && style.flexDirection.startsWith("row")) || style.display.includes("grid");
};

/** Whether an element can hold another: not an image, an icon, or a run of text. */
const canHold = (element: Element) =>
  !(element instanceof SVGElement) &&
  !VOID_TAGS.has(element.localName) &&
  (element.children.length > 0 || !element.textContent?.trim());

const idOf = (element: Element) => element.getAttribute(NODE_ID_ATTRIBUTE) ?? "";

/**
 * Where a pointer at a client position would drop the dragged element, or null
 * over no page, a vector page, or a spot that leaves the element where it is.
 * Over an empty part of a page it drops at the page's end.
 */
export const findCanvasDrop = (
  clientX: number,
  clientY: number,
  dragged: { pageId: string; nodeId: string },
): CanvasDrop | null => {
  const holds = (rect: DOMRect) => clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
  // Pages can overlap. The dragged element's own page wins, then any other.
  const hits = [...frames.entries()].filter(([, entry]) => holds(entry.frame.host.getBoundingClientRect()));
  const [pageId, entry] = hits.find(([id]) => id === dragged.pageId) ?? hits[0] ?? [];
  if (!pageId || !entry || entry.isVector) return null;

  const { root, host, viewport } = entry.frame;
  const hostRect = host.getBoundingClientRect();
  const scale = hostRect.width > 0 ? hostRect.width / viewport.width : 1;
  const toPage = (element: Element): Box & { nodeId: string } => {
    const rect = element.getBoundingClientRect();
    return {
      nodeId: idOf(element),
      x: (rect.left - hostRect.left) / scale,
      y: (rect.top - hostRect.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    };
  };
  const point = { x: (clientX - hostRect.left) / scale, y: (clientY - hostRect.top) / scale };
  const self =
    pageId === dragged.pageId ? root.querySelector(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(dragged.nodeId)}"]`) : null;
  const isOwnPart = (element: Element) => !!self && (element === self || self.contains(element));

  // The deepest element under the pointer, read from boxes since the page is inert.
  const nodes = root.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`);
  let hit: Element | null = null;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (isOwnPart(node)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && holds(rect)) {
      hit = node;
      break;
    }
  }

  const beside = (element: Element): CanvasDrop | null => {
    const box = toPage(element);
    const isRow = isRowLayout(element.parentElement);
    const position: InsertPosition =
      (isRow ? point.x - box.x < box.width / 2 : point.y - box.y < box.height / 2) ? "before" : "after";
    // Right before the element's next sibling or right after its previous one
    // leaves it where it is.
    if (self && (position === "before" ? element.previousElementSibling : element.nextElementSibling) === self) {
      return null;
    }
    const edge = position === "before" ? 0 : 1;
    const indicator = isRow
      ? { kind: "line" as const, x: box.x + box.width * edge - LINE_PX / 2, y: box.y, width: LINE_PX, height: box.height }
      : { kind: "line" as const, x: box.x, y: box.y + box.height * edge - LINE_PX / 2, width: box.width, height: LINE_PX };
    return { pageId, target: { nodeId: box.nodeId, position }, indicator };
  };

  if (!hit) {
    // Below the content: after the page's last top-level element.
    const body = root.querySelector(`[${INERT_BODY_ATTRIBUTE}]`);
    const last = body
      ? Array.from(body.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`)).findLast(
          (element) => element.parentElement?.closest(`[${NODE_ID_ATTRIBUTE}]`) === null && !isOwnPart(element),
        )
      : null;
    if (!last) return { pageId, target: "end", indicator: { kind: "box", x: 0, y: 0, width: viewport.width, height: viewport.height } };
    if (self && last.nextElementSibling === self) return null;
    const box = toPage(last);
    return {
      pageId,
      target: { nodeId: box.nodeId, position: "after" },
      indicator: { kind: "line", x: box.x, y: box.y + box.height - LINE_PX / 2, width: box.width, height: LINE_PX },
    };
  }

  if (!canHold(hit)) return beside(hit);
  const box = toPage(hit);
  const isRow = isRowLayout(hit.parentElement);
  const fromStart = isRow ? point.x - box.x : point.y - box.y;
  const length = isRow ? box.width : box.height;
  const band = length * EDGE_BAND;
  if (hit.parentElement?.closest(`[${NODE_ID_ATTRIBUTE}]`) && (fromStart < band || length - fromStart < band)) {
    return beside(hit);
  }

  // Into the container, between the children nearest the pointer.
  const children = Array.from(hit.children).filter((child) => child.hasAttribute(NODE_ID_ATTRIBUTE));
  if (children.length === 0) {
    return { pageId, target: { nodeId: box.nodeId, position: "inside" }, indicator: { kind: "box", ...box } };
  }
  // The dragged element is never under the pointer, but it can be one of
  // these children, which findDropTarget skips and reads adjacency from.
  const selfId = self && children.includes(self) ? dragged.nodeId : "";
  const drop = findDropTarget(children.map(toPage), selfId, isRowLayout(hit) ? "row" : "column", point);
  if (!drop) return null;
  return {
    pageId,
    target: { nodeId: drop.targetId, position: drop.position },
    indicator: { kind: "line", ...drop.line },
  };
};

/** The drop the pointer is over during a drag, which the page it lands on draws. */
export const useDropIndicator = create<{ drop: CanvasDrop | null; setDrop: (drop: CanvasDrop | null) => void }>((set) => ({
  drop: null,
  setDrop: (drop) => set({ drop }),
}));
