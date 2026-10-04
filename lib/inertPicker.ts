/**
 * The element tool for inert canvas frames, the in-document twin of the
 * script `lib/nodePicker.ts` injects into a live frame. It answers the same
 * requests with the same node reports, read straight from the shadow root, so
 * PageRenderer handles both frames with one code path. Positions come back in
 * page px: the frame is scaled with the canvas, so screen rects are divided by
 * the frame's scale.
 */
import { type InertViewport, sanitizeInertDeclarations } from "@/lib/inertCss";
import type { NodePreview, NodeReportIntent } from "@/lib/nodePicker";
import { NODE_ID_ATTRIBUTE, NODE_ID_FORMAT } from "@/lib/pageNodes";
import type { Matrix } from "@/lib/vectorPath";

export interface InertFrame {
  root: ShadowRoot;
  host: HTMLElement;
  /** The device frame in page px, for converting screen positions and viewport units. */
  viewport: InertViewport;
}

const MAX_REPORTED_SIBLINGS = 200;
const NODE_SELECTOR = `[${NODE_ID_ATTRIBUTE}]`;

let paint: CanvasRenderingContext2D | null = null;
// Tailwind 4 computes oklch() colors, which a 1px canvas turns into hex.
const toHex = (value: string) => {
  if (!value || value === "transparent") return null;
  paint ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!paint) return null;
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = "#000";
  paint.fillStyle = value;
  paint.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = paint.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return null;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const frameGeometry = ({ host, viewport }: InertFrame) => {
  const rect = host.getBoundingClientRect();
  return { rect, scale: rect.width > 0 ? rect.width / viewport.width : 1 };
};

/** The node with this id, ignoring ids that could not have come from the editor. */
export const findInertNode = (frame: InertFrame, nodeId: unknown) =>
  typeof nodeId === "string" && NODE_ID_FORMAT.test(nodeId)
    ? frame.root.querySelector(`[${NODE_ID_ATTRIBUTE}="${nodeId}"]`)
    : null;

/**
 * The element with an id under a point given in page px. The frame is `inert`,
 * so the browser's own hit testing skips it, and this reads boxes and computed
 * styles instead, which changes nothing, so a hover on every frame never makes
 * the browser restyle the page.
 *
 * Of the elements whose box holds the point, it skips any clipped away there by
 * an ancestor's overflow, or that the browser would not hit. It prefers one in
 * a fixed or sticky layer, then one in a positioned layer with a z-index, the
 * way a header paints over the hero under it, then the last in document order,
 * which is the deepest. That approximates `elementFromPoint` without a full
 * stacking order.
 */
export const inertNodeAt = (frame: InertFrame, x: number, y: number) => {
  const { rect, scale } = frameGeometry(frame);
  const pointX = rect.left + x * scale;
  const pointY = rect.top + y * scale;
  const holds = (box: DOMRect) =>
    pointX >= box.left && pointX < box.right && pointY >= box.top && pointY < box.bottom;
  const styles = new Map<Element, CSSStyleDeclaration>();
  const styleOf = (element: Element) => {
    let style = styles.get(element);
    if (!style) {
      style = getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  // 2 for a fixed or sticky layer, 1 for a positioned one with a z-index, 0 in
  // the flow, or -1 when an ancestor's overflow clips the point away.
  const layerOf = (element: Element) => {
    let layer = 0;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = styleOf(ancestor);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        if (!holds(ancestor.getBoundingClientRect())) return -1;
      }
      if (style.position === "fixed" || style.position === "sticky") layer = 2;
      else if (style.position !== "static" && style.zIndex !== "auto") layer = Math.max(layer, 1);
    }
    const own = styleOf(element);
    if (own.position === "fixed" || own.position === "sticky") return 2;
    if (own.position !== "static" && own.zIndex !== "auto") return Math.max(layer, 1);
    return layer;
  };

  let best: Element | null = null;
  let bestLayer = -1;
  const nodes = frame.root.querySelectorAll(NODE_SELECTOR);
  for (let index = nodes.length - 1; index >= 0 && bestLayer < 2; index -= 1) {
    const node = nodes[index];
    if (!holds(node.getBoundingClientRect())) continue;
    // The live frame's picker skips these too, since the browser does.
    const style = styleOf(node);
    if (style.visibility !== "visible" || style.pointerEvents === "none") continue;
    const layer = layerOf(node);
    if (layer > bestLayer) {
      best = node;
      bestLayer = layer;
    }
  }
  return best;
};

/** An SVG matrix in its root's px, moved by where that root sits in the page. */
export const offsetMatrix = ([a, b, c, d, e, f]: Matrix, x: number, y: number): Matrix => [a, b, c, d, e + x, f + y];

const toPageBox = (frame: InertFrame, element: Element) => {
  const { rect: frameRect, scale } = frameGeometry(frame);
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - frameRect.left) / scale,
    y: (rect.top - frameRect.top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
};

/** Where an element sits in the page, in page px. */
export const inertElementBox = (frame: InertFrame, element: Element | null) =>
  element ? toPageBox(frame, element) : null;

/** A report shaped like the live frame's, which PageRenderer validates the same way. */
export const reportInertNode = (frame: InertFrame, element: Element | null, intent: NodeReportIntent) => {
  if (!element) return null;
  const toPage = (child: Element) => toPageBox(frame, child);
  const box = toPage(element);
  const style = getComputedStyle(element);
  const node: Record<string, unknown> = {
    nodeId: element.getAttribute(NODE_ID_ATTRIBUTE),
    tag: element.tagName.toLowerCase(),
    ...box,
    color: toHex(style.color),
    background: toHex(style.backgroundColor),
    matrix: null,
    isSvg: element instanceof SVGElement,
    styles: {
      width: box.width,
      height: box.height,
      opacity: Number.parseFloat(style.opacity),
      "font-size": Number.parseFloat(style.fontSize),
      "font-weight": Number.parseFloat(style.fontWeight),
      "padding-block": Number.parseFloat(style.paddingTop),
      "padding-inline": Number.parseFloat(style.paddingLeft),
      gap: Number.parseFloat(style.rowGap) || 0,
      "border-radius": Number.parseFloat(style.borderTopLeftRadius),
    },
  };
  if (intent !== "hover") {
    const holder = element.parentElement;
    const parentStyle = holder ? getComputedStyle(holder) : null;
    const isRow =
      !!parentStyle &&
      ((parentStyle.display.includes("flex") && parentStyle.flexDirection.startsWith("row")) ||
        parentStyle.display.includes("grid"));
    const siblings = holder
      ? Array.from(holder.children).filter((child) => child.hasAttribute(NODE_ID_ATTRIBUTE))
      : [element];
    node.layout = {
      parentId: holder?.closest(NODE_SELECTOR)?.getAttribute(NODE_ID_ATTRIBUTE) ?? null,
      axis: isRow ? "row" : "column",
      siblings: siblings.slice(0, MAX_REPORTED_SIBLINGS).map((child) => ({
        nodeId: child.getAttribute(NODE_ID_ATTRIBUTE),
        ...toPage(child),
      })),
      parentBox: holder ? toPage(holder) : null,
      isAbsolute: style.position === "absolute",
      left: Number.parseFloat(style.left) || 0,
      top: Number.parseFloat(style.top) || 0,
    };
  }
  // An SVG shape's own coordinates to page px, for the pen tool's handles.
  // getCTM stops at the SVG's own viewport, so the canvas zoom never enters
  // it, and the viewport's box places it in the page.
  if (element instanceof SVGGraphicsElement) {
    const ctm = element.getCTM();
    const anchor = element.viewportElement ?? element;
    if (ctm) {
      const origin = toPage(anchor);
      node.matrix = offsetMatrix([ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f], origin.x, origin.y);
    }
  }
  return node;
};

/**
 * Shows an inspector edit on the element before it is saved, as the live frame
 * does. Values go through the inert CSS rules, since there is no CSP here to
 * stop a `url()` from loading.
 */
export const applyInertPreview = (
  element: Element,
  preview: Omit<NodePreview, "pageId" | "nodeId">,
  viewport: InertViewport,
) => {
  // Every HTML and SVG element has a style; anything else has nothing to preview.
  const { style } = element as HTMLElement | SVGElement;
  if (!style) return;
  const clean = (value: string) => sanitizeInertDeclarations(value, viewport);
  if (typeof preview.text === "string") element.textContent = preview.text;
  if (typeof preview.color === "string") style.setProperty("color", clean(preview.color));
  if (typeof preview.background === "string") style.setProperty("background-color", clean(preview.background));
  if (typeof preview.d === "string") element.setAttribute("d", preview.d);
  for (const [name, value] of Object.entries(preview.style ?? {})) {
    if (/^[a-z-]+$/.test(name) && typeof value === "string") style.setProperty(name, clean(value));
  }
};
