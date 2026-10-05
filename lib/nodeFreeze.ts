/**
 * Makes an element self-contained, so it looks the same on any page: the way a
 * node in a design tool carries its own fill, font, and layout wherever it is
 * moved. A generated page styles its elements from page-level CSS (its
 * <style> block, Tailwind classes compiled for that page, CSS variables, and
 * what <body> passes down), so the element's markup alone would pick up the
 * other page's CSS instead.
 *
 * The canvas already renders every idle page as inert DOM, so the browser has
 * resolved all of that. `freezeElement` reads the result off the rendered
 * element and its children and writes it back as inline styles, keeping only
 * declarations that differ from what the element would get anyway. Classes go,
 * so the other page's rules cannot match, except on an element that draws
 * through ::before or ::after, such as an icon font glyph, which needs them.
 *
 * Hover styles, media queries, and animations are page rules, not resolved
 * values, so a frozen element keeps how it looks at rest and loses those.
 */
import { findNodeSpan, NODE_ID_ATTRIBUTE, stampNodeIds } from "@/lib/pageNodes";

// Inherited properties a page usually sets on <body>, which the moved element
// always repeats, since the page it lands on sets its own.
const PAGE_INHERITED_PROPERTIES = new Set(["color", "font-family", "font-size", "font-weight", "line-height", "text-align"]);

// Properties that inherit. An element repeats one only where it differs from
// its parent, or where the browser's own stylesheet sets it on that tag, such
// as an <h1>'s size, so a page that resets those cannot change it.
const INHERITED_PROPERTIES = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "text-shadow",
  "white-space",
  "word-break",
  "overflow-wrap",
  "list-style-type",
  "list-style-position",
  "fill",
  "stroke",
  "stroke-width",
  "-webkit-text-fill-color",
];

// Properties that do not inherit. An element sets one where it differs from
// the browser's default for the tag or from the property's initial value, so a
// page whose reset changes either default cannot change it. `display` only
// where it differs from the tag's default, since no reset changes it. Width,
// height, and grid tracks are measured separately in `sizeDeclarations`.
const OWN_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "box-sizing",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "overflow-x",
  "overflow-y",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "justify-content",
  "justify-items",
  "justify-self",
  "align-content",
  "align-items",
  "align-self",
  "row-gap",
  "column-gap",
  "grid-template-rows",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  "aspect-ratio",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-clip",
  "-webkit-background-clip",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  "box-shadow",
  "opacity",
  "transform",
  "transform-origin",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "clip-path",
  "object-fit",
  "object-position",
  "vertical-align",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-overflow",
  "-webkit-line-clamp",
  "-webkit-box-orient",
];

const SIDES = ["top", "right", "bottom", "left"] as const;

/** Reads one computed property, the way `CSSStyleDeclaration.getPropertyValue` does. */
export type StyleRead = (property: string) => string;

/**
 * The declarations that reproduce an element's look outside its page, from
 * its computed style (`own`), its parent's (`parent`, null for none), and two
 * baselines: the same tag with only the browser's stylesheet (`plain`, with
 * `plainParent` for its parent) and with every property at its initial value
 * (`initial`). `isRoot` marks the element being moved, which repeats the
 * inherited properties a page sets on <body>, and any other it changed, since
 * its new parent passes down different ones.
 */
export const pickDeclarations = ({
  own,
  parent,
  plain,
  plainParent,
  initial,
  isRoot,
}: {
  own: StyleRead;
  parent: StyleRead | null;
  plain: StyleRead;
  plainParent: StyleRead;
  initial: StyleRead;
  isRoot: boolean;
}) => {
  const declarations: Record<string, string> = {};
  for (const property of INHERITED_PROPERTIES) {
    const value = own(property);
    if (!value) continue;
    const isPinnedByTag = plain(property) !== plainParent(property);
    const differs = isRoot
      ? PAGE_INHERITED_PROPERTIES.has(property) || value !== plainParent(property)
      : !parent || value !== parent(property);
    if (differs || isPinnedByTag) declarations[property] = value;
  }
  for (const property of OWN_PROPERTIES) {
    const value = own(property);
    if (!value) continue;
    const isDefault =
      property === "display" ? value === plain(property) : value === plain(property) && value === initial(property);
    if (!isDefault) declarations[property] = value;
  }
  // These compute to a value even when they change nothing: the text fill
  // follows the color, a transform origin only matters with a transform, and
  // an automatic minimum size is the default for a flex or grid item.
  if (own("-webkit-text-fill-color") === own("color")) delete declarations["-webkit-text-fill-color"];
  if (own("transform") === "none") delete declarations["transform-origin"];
  if (own("min-width") === "auto") delete declarations["min-width"];
  if (own("min-height") === "auto") delete declarations["min-height"];
  // A side with no border, an outline set to none, or a missing underline
  // draws nothing, whatever its color says.
  for (const side of SIDES) {
    if (Number.parseFloat(own(`border-${side}-width`)) === 0) {
      delete declarations[`border-${side}-width`];
      delete declarations[`border-${side}-style`];
      delete declarations[`border-${side}-color`];
    }
  }
  if (own("outline-style") === "none") {
    delete declarations["outline-width"];
    delete declarations["outline-style"];
    delete declarations["outline-color"];
    delete declarations["outline-offset"];
  }
  if (own("text-decoration-line") === "none") {
    delete declarations["text-decoration-style"];
    delete declarations["text-decoration-color"];
  }
  return declarations;
};

/**
 * Columns written as equal fractions, where the browser reports the px each
 * track came to. Equal tracks that fill the grid become that many equal
 * fractions again, so the grid still fits a narrower page. Anything else
 * stays in px.
 */
export const gridColumns = (tracks: string, contentWidth: number, gap: number) => {
  const sizes = tracks.trim().split(/\s+/).map((track) => (/^[\d.]+px$/.test(track) ? Number.parseFloat(track) : Number.NaN));
  if (sizes.length === 0 || sizes.some(Number.isNaN)) return tracks;
  const isEqual = sizes.every((size) => Math.abs(size - sizes[0]) < 1);
  const total = sizes.reduce((sum, size) => sum + size, 0) + gap * (sizes.length - 1);
  return isEqual && Math.abs(total - contentWidth) < 2 ? `repeat(${sizes.length}, minmax(0, 1fr))` : tracks;
};

export const serializeDeclarations = (declarations: Record<string, string>) =>
  Object.entries(declarations)
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");

// A hidden shadow root holding plain elements, for the per-tag baselines. It
// sits outside every page, so only the browser's own stylesheet applies.
let baselineHost: { parent: HTMLElement } | null = null;
const baselineCache = new Map<string, { plain: Map<string, string>; plainParent: Map<string, string>; initial: Map<string, string> }>();
const ALL_PROPERTIES = [...INHERITED_PROPERTIES, ...OWN_PROPERTIES];

const snapshot = (style: CSSStyleDeclaration) =>
  new Map(ALL_PROPERTIES.map((property) => [property, style.getPropertyValue(property)]));

const baselineFor = (element: Element) => {
  const key = `${element.namespaceURI}:${element.localName}`;
  const cached = baselineCache.get(key);
  if (cached) return cached;
  if (!baselineHost) {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "all: initial; position: fixed; left: -10000px; top: 0; width: 1000px; visibility: hidden; pointer-events: none";
    document.body.append(host);
    const parent = document.createElement("div");
    host.attachShadow({ mode: "open" }).append(parent);
    baselineHost = { parent };
  }
  const { parent } = baselineHost;
  const plain = document.createElementNS(element.namespaceURI, element.localName);
  const reset = document.createElementNS(element.namespaceURI, element.localName) as HTMLElement;
  reset.setAttribute("style", "all: initial");
  parent.append(plain, reset);
  const baseline = {
    plain: snapshot(getComputedStyle(plain)),
    plainParent: snapshot(getComputedStyle(parent)),
    initial: snapshot(getComputedStyle(reset)),
  };
  plain.remove();
  reset.remove();
  baselineCache.set(key, baseline);
  return baseline;
};

/**
 * Whether the element lays out the same with `overrides` applied, which tells
 * a size or margin the page left to the browser (`auto`, a stretch, a fill)
 * from one it fixed. A bottom or right margin moves what comes after the
 * element rather than the element, so the next sibling and the parent's size
 * are read too. Offsets are layout px, which the canvas zoom does not scale.
 * The element's own inline style is put back exactly.
 */
const laysOutSameWith = (element: HTMLElement, overrides: Record<string, string>) => {
  const next = element.nextElementSibling instanceof HTMLElement ? element.nextElementSibling : null;
  const holder = element.parentElement;
  const read = () => [
    element.offsetLeft,
    element.offsetTop,
    element.offsetWidth,
    element.offsetHeight,
    next?.offsetLeft ?? 0,
    next?.offsetTop ?? 0,
    holder?.offsetWidth ?? 0,
    holder?.offsetHeight ?? 0,
  ];
  const before = read();
  const saved = Object.keys(overrides).map((property) => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }));
  for (const [property, value] of Object.entries(overrides)) element.style.setProperty(property, value, "important");
  const after = read();
  for (const { property, value, priority } of saved) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }
  return before.every((value, index) => Math.abs(value - after[index]) < 0.5);
};

const isContainer = (style: CSSStyleDeclaration | null) =>
  !!style && /flex|grid/.test(style.display);

/**
 * Width, height, auto margins, and grid columns, which the browser reports in
 * the px they came to. Each is written as the page meant it where that can be
 * told from layout: left out when the browser sized it, `100%` when it fills
 * its parent, `auto` for a margin that centers or pushes, equal fractions for
 * an even grid.
 */
const sizeDeclarations = (element: Element, style: CSSStyleDeclaration, isRoot: boolean) => {
  const declarations: Record<string, string> = {};
  if (style.display === "none" || style.display === "contents") return declarations;
  if (!(element instanceof HTMLElement)) {
    // An SVG has no layout offsets. Its size is whatever the page set.
    for (const property of ["width", "height"]) {
      const value = style.getPropertyValue(property);
      if (value && value !== "auto") declarations[property] = value;
    }
    return declarations;
  }
  if (style.display === "inline") return declarations;

  const holder = element.parentElement;
  const holderStyle = holder ? getComputedStyle(holder) : null;
  if (!laysOutSameWith(element, { width: "auto" })) {
    const holderWidth = holder
      ? holder.clientWidth - Number.parseFloat(holderStyle?.paddingLeft ?? "0") - Number.parseFloat(holderStyle?.paddingRight ?? "0")
      : Number.NaN;
    declarations.width = Math.abs(element.offsetWidth - holderWidth) < 0.5 ? "100%" : style.width;
  } else if (isRoot && isContainer(holderStyle) && style.flexGrow === "0") {
    // The moved element took its width from a row or grid track. Keep that
    // width, but let a narrower page shrink it.
    declarations.width = `${element.offsetWidth}px`;
    declarations["max-width"] = style.maxWidth === "none" ? "100%" : style.maxWidth;
  }
  if (!laysOutSameWith(element, { height: "auto" })) declarations.height = style.height;

  for (const side of SIDES) {
    const property = `margin-${side}`;
    if (Number.parseFloat(style.getPropertyValue(property)) > 0.5 && laysOutSameWith(element, { [property]: "auto" })) {
      declarations[property] = "auto";
    }
  }

  if (/grid/.test(style.display) && style.gridTemplateColumns !== "none") {
    const contentWidth =
      element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    declarations["grid-template-columns"] = gridColumns(
      style.gridTemplateColumns,
      contentWidth,
      Number.parseFloat(style.columnGap) || 0,
    );
  }
  return declarations;
};

const drawsPseudoContent = (element: Element) =>
  ["::before", "::after"].some((pseudo) => {
    const content = getComputedStyle(element, pseudo).content;
    return !!content && content !== "none" && content !== "normal";
  });

/** The inline declarations that reproduce `rendered`, the element as the canvas drew it. */
const freezeDeclarations = (rendered: Element, isRoot: boolean) => {
  const style = getComputedStyle(rendered);
  const parent = rendered.parentElement ? getComputedStyle(rendered.parentElement) : null;
  const baseline = baselineFor(rendered);
  const read = (values: Map<string, string>): StyleRead => (property) => values.get(property) ?? "";
  return {
    ...pickDeclarations({
      own: (property) => style.getPropertyValue(property),
      parent: parent ? (property) => parent.getPropertyValue(property) : null,
      plain: read(baseline.plain),
      plainParent: read(baseline.plainParent),
      initial: read(baseline.initial),
      isRoot,
    }),
    ...sizeDeclarations(rendered, style, isRoot),
  };
};

/**
 * The element `nodeId` from `html` as markup that renders the same on any
 * page, its own look written inline and its ids removed so the page it lands
 * on gives it new ones. `rendered` is the page as the canvas drew it, where
 * each element is found by its id. Null when the element is not on the page.
 */
export const freezeElement = (html: string, nodeId: string, rendered: ParentNode) => {
  const source = stampNodeIds(html);
  const span = findNodeSpan(source, nodeId);
  if (!span) return null;
  // A template parses table rows and list items in place and loads nothing.
  const template = document.createElement("template");
  template.innerHTML = source.slice(span.start, span.end);
  const root = template.content.firstElementChild;
  if (!root) return null;

  const elements = [root, ...Array.from(root.querySelectorAll(`[${NODE_ID_ATTRIBUTE}]`))];
  // Read every style before writing any, since a write could change a later read.
  const frozen = elements.map((element) => {
    const id = element.getAttribute(NODE_ID_ATTRIBUTE);
    const match = id ? rendered.querySelector(`[${NODE_ID_ATTRIBUTE}="${CSS.escape(id)}"]`) : null;
    return match
      ? { element, declarations: freezeDeclarations(match, element === root), keepsClasses: drawsPseudoContent(match) }
      : null;
  });
  for (const entry of frozen) {
    if (!entry) continue;
    entry.element.setAttribute("style", serializeDeclarations(entry.declarations));
    if (!entry.keepsClasses) entry.element.removeAttribute("class");
  }
  for (const element of elements) element.removeAttribute(NODE_ID_ATTRIBUTE);
  return root.outerHTML;
};
