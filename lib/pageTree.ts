/**
 * A page's elements as a tree of layers, and the structural edits the layers
 * panel, the canvas, and MCP agents make to it: move, duplicate, delete, wrap,
 * hide, and insert.
 *
 * The page stays an HTML string. Each edit cuts and splices source spans found
 * by `data-wirely-id`, so the rest of the page keeps its exact text and an
 * agent's patch_page oldString still matches after a user edit. Every function
 * takes stamped or unstamped HTML and returns stamped HTML, or null when an id
 * is gone or the edit makes no sense, such as moving an element into itself.
 */
import {
  ARTBOARD_MARKER,
  findNodeSpan,
  getNodeText,
  isSelfClosing,
  OPAQUE_TAGS,
  readNodeId,
  removeNodeAttribute,
  scanTags,
  setNodeAttribute,
  SKIPPED_TAGS,
  stampNodeIds,
} from "@/lib/pageNodes";

export type LayerKind = "frame" | "text" | "image" | "vector" | "control" | "other";

export interface Layer {
  id: string;
  tag: string;
  kind: LayerKind;
  /** What the panel shows: the element's text, alt, or aria-label, else its tag. */
  label: string;
  hidden: boolean;
  children: Layer[];
}

const TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "a", "label", "li", "strong", "em", "b", "i",
  "small", "blockquote", "figcaption", "td", "th", "dt", "dd", "code", "pre",
]);
const IMAGE_TAGS = new Set(["img", "picture", "video", "canvas", "iframe"]);
const VECTOR_TAGS = new Set(["svg", "path", "g", "circle", "ellipse", "rect", "line", "polyline", "polygon", "use", "text"]);
const CONTROL_TAGS = new Set(["button", "input", "select", "textarea", "form"]);

const LABEL_MAX_CHARS = 40;

const attributeValue = (attributes: string, name: string) =>
  new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attributes)?.slice(2).find(
    (value) => value !== undefined,
  ) ?? null;

const clipLabel = (value: string) => {
  const text = value.replace(/\s+/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
};

const kindOf = (tag: string, isTextOnly: boolean): LayerKind => {
  if (VECTOR_TAGS.has(tag)) return "vector";
  if (IMAGE_TAGS.has(tag)) return "image";
  if (CONTROL_TAGS.has(tag)) return "control";
  if (TEXT_TAGS.has(tag) || isTextOnly) return "text";
  if (["div", "section", "header", "footer", "main", "nav", "aside", "article", "ul", "ol", "form", "figure", "table"].includes(tag)) {
    return "frame";
  }
  return "other";
};

/** The page's visible elements as a tree, in document order. */
export const buildLayerTree = (html: string): Layer[] => {
  const source = stampNodeIds(html);
  const roots: Layer[] = [];
  // Every open element, so a closing tag finds its layer. `layer` is null for
  // elements outside the tree, like <body> itself.
  const open: Array<{ name: string; layer: Layer | null; openEnd: number }> = [];
  let inBody = !/<body\b/i.test(source);
  let opaqueDepth = 0;
  let opaqueName = "";

  for (const tag of scanTags(source)) {
    if (tag.name === "body") {
      inBody = !tag.isClosing;
      continue;
    }
    if (!inBody) continue;
    if (opaqueDepth > 0) {
      if (tag.name === opaqueName && (tag.isClosing || !isSelfClosing(tag))) {
        opaqueDepth += tag.isClosing ? -1 : 1;
      }
      continue;
    }

    if (tag.isClosing) {
      const index = open.findLastIndex((entry) => entry.name === tag.name);
      if (index === -1) continue;
      const [entry] = open.splice(index);
      if (entry.layer && entry.layer.children.length === 0) {
        const content = source.slice(entry.openEnd, tag.start);
        if (content.trim() && !content.includes("<")) {
          entry.layer.label = clipLabel(content);
          if (entry.layer.kind === "frame" || entry.layer.kind === "other") entry.layer.kind = "text";
        }
      }
      continue;
    }
    if (SKIPPED_TAGS.has(tag.name)) continue;

    const id = readNodeId(tag.attributes);
    const layer: Layer | null = id
      ? {
          id,
          tag: tag.name,
          kind: kindOf(tag.name, false),
          label: clipLabel(
            attributeValue(tag.attributes, "aria-label") ??
              attributeValue(tag.attributes, "alt") ??
              attributeValue(tag.attributes, "data-name") ??
              tag.name,
          ),
          hidden: /\shidden(?=[\s=/>]|$)/i.test(` ${tag.attributes}`),
          children: [],
        }
      : null;
    if (layer) {
      const parent = open.findLast((entry) => entry.layer)?.layer;
      (parent ? parent.children : roots).push(layer);
    }

    if (OPAQUE_TAGS.has(tag.name) && !isSelfClosing(tag) && !ARTBOARD_MARKER.test(tag.attributes)) {
      // An icon is one layer. Its closing tag ends the skip.
      opaqueDepth = 1;
      opaqueName = tag.name;
      continue;
    }
    if (!isSelfClosing(tag)) open.push({ name: tag.name, layer, openEnd: tag.end });
  }
  return roots;
};

/** The layer with `nodeId`, searched depth first. */
export const findLayer = (layers: Layer[], nodeId: string): Layer | null => {
  for (const layer of layers) {
    if (layer.id === nodeId) return layer;
    const found = findLayer(layer.children, nodeId);
    if (found) return found;
  }
  return null;
};

/** The id of the layer holding `nodeId`, null for a top level layer, undefined when absent. */
export const findLayerParent = (layers: Layer[], nodeId: string): string | null | undefined => {
  for (const layer of layers) {
    if (layer.id === nodeId) return null;
    const found = findLayerParent(layer.children, nodeId);
    if (found !== undefined) return found ?? layer.id;
  }
  return undefined;
};

export type InsertPosition = "before" | "after" | "inside";

/** Where `position` relative to the element puts new content, or null. */
const insertionPoint = (html: string, targetId: string, position: InsertPosition) => {
  const span = findNodeSpan(html, targetId);
  if (!span) return null;
  if (position === "before") return span.start;
  if (position === "after") return span.end;
  // A void element such as <img> has no inside.
  return span.closeStart === span.openEnd && span.end === span.openEnd ? null : span.closeStart;
};

/** The id of the element that starts at `offset` in stamped `html`. */
const idAt = (html: string, offset: number) => {
  const tag = /^<[a-zA-Z][^>]*>/.exec(html.slice(offset));
  return tag ? readNodeId(tag[0]) : null;
};

export const removeNode = (html: string, nodeId: string) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  if (!span) return null;
  return source.slice(0, span.start) + source.slice(span.end);
};

/**
 * Moves the element next to or into `targetId`. Null when either is gone or
 * the target is the element or inside it.
 */
export const moveNode = (
  html: string,
  nodeId: string,
  targetId: string,
  position: InsertPosition,
) => {
  if (nodeId === targetId) return null;
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  const target = findNodeSpan(source, targetId);
  if (!span || !target) return null;
  if (target.start >= span.start && target.end <= span.end) return null;

  const fragment = source.slice(span.start, span.end);
  const without = source.slice(0, span.start) + source.slice(span.end);
  const at = insertionPoint(without, targetId, position);
  if (at === null) return null;
  return without.slice(0, at) + fragment + without.slice(at);
};

/** Inserts `markup` relative to `targetId`. Returns the page and the new element's id. */
export const insertNode = (
  html: string,
  targetId: string,
  position: InsertPosition,
  markup: string,
) => {
  const source = stampNodeIds(html);
  const at = insertionPoint(source, targetId, position);
  if (at === null) return null;
  const next = stampNodeIds(source.slice(0, at) + markup + source.slice(at));
  const newId = idAt(next, at);
  return newId ? { html: next, newId } : null;
};

/**
 * Inserts `markup` where a click or drop on an element puts it: inside a
 * container, after an element with no children of its own (a void tag, text,
 * or SVG). Returns the page and the new element's id.
 */
export const insertAtNode = (html: string, node: { nodeId: string; isSvg: boolean }, markup: string) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, node.nodeId);
  if (!span) return null;
  const isVoid = span.end === span.openEnd;
  const holdsText = getNodeText(source, node.nodeId) !== null;
  return insertNode(source, node.nodeId, isVoid || holdsText || node.isSvg ? "after" : "inside", markup);
};

/**
 * Adds `markup` at the end of the page, after its last top-level element, or
 * as the whole body of a page with none yet. Returns the page and the new
 * element's id.
 */
export const appendToPage = (html: string, markup: string) => {
  const last = buildLayerTree(html).at(-1);
  if (last) return insertNode(html, last.id, "after", markup);
  if (html.trim()) return null;
  const next = stampNodeIds(`<!doctype html><html><head><meta charset="utf-8"></head><body>${markup}</body></html>`);
  const newId = buildLayerTree(next)[0]?.id;
  return newId ? { html: next, newId } : null;
};

/** Copies the element right after itself. The copy and its children get new ids. */
export const duplicateNode = (html: string, nodeId: string) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  if (!span) return null;
  return insertNode(source, nodeId, "after", source.slice(span.start, span.end));
};

/**
 * Wraps the element in a new flex column frame, the way Figma's "frame
 * selection" does. Returns the page and the frame's id.
 */
export const wrapNode = (html: string, nodeId: string) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  if (!span) return null;
  const next = stampNodeIds(
    source.slice(0, span.start) +
      '<div style="display: flex; flex-direction: column">' +
      source.slice(span.start, span.end) +
      "</div>" +
      source.slice(span.end),
  );
  const newId = idAt(next, span.start);
  return newId ? { html: next, newId } : null;
};

/** Hides the element with the `hidden` attribute, or shows it again. */
export const setNodeHidden = (html: string, nodeId: string, hidden: boolean) => {
  const source = stampNodeIds(html);
  return hidden
    ? setNodeAttribute(source, nodeId, "hidden", "")
    : removeNodeAttribute(source, nodeId, "hidden");
};

/** The markup the insert tools add. Inline styles, so they render with or without Tailwind. */
export const INSERT_MARKUP = {
  frame:
    '<div data-name="Frame" style="display: flex; flex-direction: column; gap: 16px; padding: 24px; min-height: 120px; border: 1px dashed #a1a1aa"></div>',
  text: '<p style="font-size: 16px">Text</p>',
  rectangle:
    '<div data-name="Rectangle" style="width: 160px; height: 120px; background-color: #d4d4d8; border-radius: 8px"></div>',
} as const;

export type InsertKind = keyof typeof INSERT_MARKUP;

const NODE_ID_ATTRIBUTE_PATTERN = /\sdata-wirely-id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** The element's markup with its node ids removed, so wherever it lands it gets new ones. */
export const copyNodeMarkup = (html: string, nodeId: string) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  return span ? source.slice(span.start, span.end).replace(NODE_ID_ATTRIBUTE_PATTERN, "") : null;
};

/** Copies the element next to or into `targetId` on the same page. Returns the page and the copy's id. */
export const copyNode = (html: string, nodeId: string, targetId: string, position: InsertPosition) => {
  const markup = copyNodeMarkup(html, nodeId);
  return markup === null ? null : insertNode(html, targetId, position, markup);
};

// The icon font the generation prompts link. Its glyphs draw through
// ::before, so an icon moved to a page without the link would draw nothing.
const ICON_STYLESHEET_LINK =
  /<link\b[^>]*href\s*=\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap-icons[^"']*["'][^>]*>/i;

/** `to` with the icon font link `from` has, when it lacks one. */
export const carryIconStylesheet = (from: string, to: string) => {
  const link = ICON_STYLESHEET_LINK.exec(from)?.[0];
  if (!link || ICON_STYLESHEET_LINK.test(to)) return to;
  const at = /<\/head>/i.exec(to)?.index ?? /<body\b/i.exec(to)?.index;
  if (at !== undefined) return to.slice(0, at) + link + to.slice(at);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(to)?.[0] ?? "";
  return doctype + link + to.slice(doctype.length);
};

export type DropTarget = { nodeId: string; position: InsertPosition } | "end";

/**
 * Moves or copies an element from one page to another. `markup` is the
 * element made self-contained by `freezeElement`, since the source page's CSS
 * does not reach the target. Returns both pages and the new element's id, or
 * null when the element or the target is gone.
 */
export const transferNode = ({
  sourceHtml,
  targetHtml,
  nodeId,
  target,
  markup,
  copy,
}: {
  sourceHtml: string;
  targetHtml: string;
  nodeId: string;
  target: DropTarget;
  markup: string;
  copy: boolean;
}) => {
  const source = copy ? stampNodeIds(sourceHtml) : removeNode(sourceHtml, nodeId);
  if (source === null || !findNodeSpan(stampNodeIds(sourceHtml), nodeId)) return null;
  const inserted =
    target === "end" ? appendToPage(targetHtml, markup) : insertNode(targetHtml, target.nodeId, target.position, markup);
  if (!inserted) return null;
  return { source, target: carryIconStylesheet(sourceHtml, inserted.html), newId: inserted.newId };
};
