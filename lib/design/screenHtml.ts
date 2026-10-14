/**
 * A design screen as one self-contained HTML page for the Pages tab, so a
 * screen polished by hand can join prototypes, comments, and build checks.
 * The copy is one way: later edits to the screen do not reach the page.
 *
 * Layout and paint are the engine's own Tailwind mapping, the same one get_page
 * hands an agent, rendered by the Tailwind browser build as agent pages are.
 * On top of it this adds what that mapping leaves out and a page needs:
 * positions of layers outside auto layout, image fills, vector shapes as
 * inline SVG, the text properties it skips, and the fonts.
 */
import { computeContentBounds, renderNodesToSVG, sceneNodeToJSX } from "@open-pencil/core/io";
import type { SceneGraph, SceneNode } from "@open-pencil/scene-graph";
import { screensPage } from "@/lib/design/document";

const TAILWIND_SCRIPT = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";
const DEFAULT_FONT = "Inter";
// Shapes a box cannot draw. They go into the page as the engine's SVG.
const SVG_TYPES = new Set<SceneNode["type"]>(["VECTOR", "LINE", "STAR", "POLYGON", "BOOLEAN_OPERATION"]);
const SCALE_MODES: Record<string, string> = {
  FILL: "background-size:cover;background-repeat:no-repeat",
  CROP: "background-size:cover;background-repeat:no-repeat",
  FIT: "background-size:contain;background-repeat:no-repeat",
  TILE: "background-repeat:repeat",
};

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, "&quot;");
const px = (value: number) => `${Math.round(value * 100) / 100}px`;

/** The visible image fill a node shows on top, if any. */
const imageFillOf = (node: SceneNode) =>
  node.fills.findLast((fill) => fill.visible && fill.type === "IMAGE" && fill.imageHash);

/** The hashes of every image a node and its visible layers fill with, for uploading before the page is built. */
export const collectImageHashes = (graph: SceneGraph, nodeId: string) => {
  const hashes = new Set<string>();
  const visit = (node: SceneNode | undefined) => {
    if (!node?.visible) return;
    const hash = imageFillOf(node)?.imageHash;
    if (hash && graph.images.has(hash)) hashes.add(hash);
    for (const childId of node.childIds) visit(graph.getNode(childId));
  };
  visit(graph.getNode(nodeId));
  return [...hashes];
};

/**
 * The engine's Tailwind classes for one node. The engine keeps its mapping
 * private and only writes whole JSX trees, so they are read off the opening
 * tag it writes for the node: `<tag data-name="name" className="classes"`.
 */
const engineClasses = (node: SceneNode, graph: SceneGraph) => {
  const jsx = sceneNodeToJSX(node.id, graph, "tailwind");
  const tag = /^<[a-z]+/.exec(jsx)?.[0] ?? "";
  const nameAttribute = node.name && node.name !== node.type ? ` data-name="${node.name}"` : "";
  return /^ className="([^"]*)"/.exec(jsx.slice(tag.length + nameAttribute.length))?.[1] ?? "";
};

/** Where a layer sits when it is outside auto layout, from its parent's corner. */
const positionStyle = (node: SceneNode, graph: SceneGraph) => {
  const parent = node.parentId ? graph.getNode(node.parentId) : undefined;
  if (!parent || (parent.layoutMode !== "NONE" && node.layoutPositioning !== "ABSOLUTE")) return [];
  const at = graph.getAbsolutePosition(node.id);
  const origin = graph.getAbsolutePosition(parent.id);
  return ["position:absolute", `left:${px(at.x - origin.x)}`, `top:${px(at.y - origin.y)}`];
};

const textStyle = (node: SceneNode) => [
  "white-space:pre-wrap",
  ...(node.lineHeight ? [`line-height:${px(node.lineHeight)}`] : []),
  ...(node.letterSpacing ? [`letter-spacing:${px(node.letterSpacing)}`] : []),
  ...(node.italic ? ["font-style:italic"] : []),
  ...(node.textDecoration === "UNDERLINE" ? ["text-decoration:underline"] : []),
  ...(node.textDecoration === "STRIKETHROUGH" ? ["text-decoration:line-through"] : []),
];

const element = (tag: string, classes: string, style: string[], content: string, name: string) => {
  const attributes = [
    name ? ` data-name="${escapeAttribute(name)}"` : "",
    classes ? ` class="${escapeAttribute(classes)}"` : "",
    style.length > 0 ? ` style="${escapeAttribute(style.join(";"))}"` : "",
  ].join("");
  return `<${tag}${attributes}>${content}</${tag}>`;
};

/**
 * A screen, by local id, as a complete HTML document. `imageUrls` maps image
 * hashes to where the page loads them; an image without one is left out.
 */
export const screenToHtml = (graph: SceneGraph, screenId: string, imageUrls: ReadonlyMap<string, string>) => {
  const screen = graph.getNode(screenId);
  if (!screen) throw new Error("The screen is not in the document.");
  const pageId = screensPage(graph).id;
  const fonts = new Set<string>();

  const render = (node: SceneNode, isRoot: boolean): string => {
    if (!node.visible) return "";
    const name = node.name && node.name !== node.type ? node.name : "";
    const position = isRoot ? [] : positionStyle(node, graph);

    if (SVG_TYPES.has(node.type)) {
      const svg = renderNodesToSVG(graph, pageId, [node.id], { xmlDeclaration: false });
      const bounds = computeContentBounds(graph, [node.id]);
      if (!svg || !bounds) return "";
      // The SVG also covers the stroke past the shape's box, so it starts
      // that far up and left of the box.
      const at = graph.getAbsolutePosition(node.id);
      const offset = `display:block;margin-left:${px(bounds.minX - at.x)};margin-top:${px(bounds.minY - at.y)}`;
      return element(
        "div",
        "",
        [...position, `width:${px(node.width)}`, `height:${px(node.height)}`, "flex-shrink:0"],
        svg.replace(/^<svg /, `<svg style="${offset}" `),
        name,
      );
    }

    const classes = engineClasses(node, graph);
    const style = [...position];
    if (node.type === "ELLIPSE") style.push("border-radius:9999px");
    const image = imageFillOf(node);
    const imageUrl = image?.imageHash ? imageUrls.get(image.imageHash) : undefined;
    if (image && imageUrl) {
      style.push(`background-image:url("${imageUrl}")`, "background-position:center", SCALE_MODES[image.imageScaleMode ?? "FILL"]);
    }
    if (isRoot) style.push("position:relative", "width:100%", ...(node.minHeight ? [`min-height:${px(node.minHeight)}`] : []));

    if (node.type === "TEXT") {
      fonts.add(`${node.fontFamily || DEFAULT_FONT}:${node.fontWeight}`);
      return element("p", classes, [...style, ...textStyle(node)], escapeText(node.text), name);
    }
    const children = node.childIds.map((childId) => {
      const child = graph.getNode(childId);
      return child ? render(child, false) : "";
    });
    // Layers placed by position measure from their parent's corner. One
    // positioned itself already is that corner.
    if (!isRoot && position.length === 0 && children.some(Boolean)) style.push("position:relative");
    return element(node.type === "SECTION" ? "section" : "div", classes, style, children.join(""), name);
  };

  const body = render(screen, true);
  // Fontsource serves each Google font family and weight as one stylesheet.
  const fontLinks = [...fonts]
    .map((font) => {
      const [family, weight] = font.split(":");
      const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fontsource/${slug}/${weight}.css">`;
    })
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(screen.name)}</title>`,
    `<script src="${TAILWIND_SCRIPT}"></script>`,
    fontLinks,
    `<style>body{font-family:"${DEFAULT_FONT}",ui-sans-serif,system-ui,sans-serif}</style>`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
};
