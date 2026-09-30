/**
 * Stable ids for the elements of a page, so a click on the canvas, a sidebar
 * prompt, and an MCP agent can all name the same element.
 *
 * `stampNodeIds` gives every visible element in <body> a `data-wirely-id`. It
 * keeps ids that already exist, so an element keeps its id across patches, and
 * it is deterministic, so stamping the same HTML twice gives the same string.
 * The canvas stamps every srcdoc, and the editor saves the stamped HTML the
 * first time the user picks an element, which makes the ids the server sees
 * match the ones the canvas reported. New ids are hashed from the document, not
 * counted, so when a model rewrite drops the ids the new ones do not reuse old
 * values: a stale link fails instead of finding a different element.
 *
 * `stripWirelyArtifacts` removes the attribute from anything exported.
 */

export const NODE_ID_ATTRIBUTE = "data-wirely-id";

// Elements with no box of their own, or whose content is not page markup.
const SKIPPED_TAGS = new Set([
  "script",
  "style",
  "head",
  "html",
  "body",
  "meta",
  "link",
  "title",
  "base",
  "template",
  "noscript",
  "br",
  "wbr",
]);

// Their content is raw text, so a "<" inside them is not a tag.
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

// An SVG icon is one element to the user. Stamping its paths would bloat the
// page and let a click pick a path instead of the icon. A vector page's
// artboard is the exception: its paths are what the user edits.
const OPAQUE_TAGS = new Set(["svg"]);
const ARTBOARD_MARKER = /\sdata-wirely-artboard\b/i;

// Quote-aware, so a ">" inside an attribute value does not end the tag.
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|<!--[\s\S]*?-->/g;
const NODE_ID_PATTERN = new RegExp(`\\s${NODE_ID_ATTRIBUTE}\\s*=\\s*["']?([^"'\\s>]+)["']?`, "i");

interface Tag {
  start: number;
  end: number;
  name: string;
  isClosing: boolean;
  attributes: string;
}

/** Every tag in document order, skipping comments and the content of raw text elements. */
function* scanTags(html: string): Generator<Tag> {
  const pattern = new RegExp(TAG_PATTERN.source, "g");
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (!match[2]) continue;
    const tag: Tag = {
      start: match.index,
      end: match.index + match[0].length,
      name: match[2].toLowerCase(),
      isClosing: match[1] === "/",
      attributes: match[3] ?? "",
    };
    yield tag;
    if (!tag.isClosing && RAW_TEXT_TAGS.has(tag.name)) {
      const close = html.toLowerCase().indexOf(`</${tag.name}`, tag.end);
      if (close === -1) return;
      pattern.lastIndex = close;
    }
  }
}

const readNodeId = (attributes: string) => NODE_ID_PATTERN.exec(attributes)?.[1] ?? null;

const isSelfClosing = (tag: Tag) =>
  VOID_TAGS.has(tag.name) || tag.attributes.trimEnd().endsWith("/");

/** Where `tag`'s element closes. A void element closes where it opens. */
const findElementClose = (tag: Tag, tags: Generator<Tag>) => {
  if (isSelfClosing(tag)) return { closeStart: tag.end, end: tag.end };
  let depth = 1;
  for (const next of tags) {
    if (next.name !== tag.name || (!next.isClosing && isSelfClosing(next))) continue;
    depth += next.isClosing ? -1 : 1;
    if (depth === 0) return { closeStart: next.start, end: next.end };
  }
  return null;
};

/**
 * Walks the visible elements of <body>, calling `visit` with each opening tag.
 * Elements inside an opaque element such as <svg> are skipped.
 */
const forEachVisibleElement = (html: string, visit: (tag: Tag) => void) => {
  let inBody = !/<body\b/i.test(html);
  let opaque: { name: string; depth: number } | null = null;
  for (const tag of scanTags(html)) {
    if (tag.name === "body") {
      inBody = !tag.isClosing;
      continue;
    }
    if (!inBody) continue;
    if (opaque) {
      if (tag.name === opaque.name && (tag.isClosing || !isSelfClosing(tag))) {
        opaque.depth += tag.isClosing ? -1 : 1;
      }
      if (opaque.depth === 0) opaque = null;
      continue;
    }
    if (tag.isClosing || SKIPPED_TAGS.has(tag.name)) continue;
    visit(tag);
    if (OPAQUE_TAGS.has(tag.name) && !isSelfClosing(tag) && !ARTBOARD_MARKER.test(tag.attributes)) {
      opaque = { name: tag.name, depth: 1 };
    }
  }
};

// FNV-1a. It only has to spread ids apart, not resist anyone.
const hashString = (value: string, seed = 0x811c9dc5) => {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** Node ids are short lowercase base36 strings. */
export const NODE_ID_FORMAT = /^[a-z0-9]{1,12}$/;

/**
 * Gives every visible element without a unique `data-wirely-id` one. A
 * duplicate, as when an agent copies a card, keeps its first holder and the
 * rest get new ids.
 */
export const stampNodeIds = (html: string) => {
  if (!html) return html;

  const taken = new Set<string>();
  forEachVisibleElement(html, (tag) => {
    const id = readNodeId(tag.attributes);
    if (id) taken.add(id);
  });
  const seed = hashString(html);
  let counter = 0;
  const nextId = () => {
    let id = "";
    do {
      counter += 1;
      id = hashString(String(counter), seed).toString(36);
    } while (taken.has(id));
    taken.add(id);
    return id;
  };

  const seen = new Set<string>();
  const edits: Array<{ start: number; end: number; text: string }> = [];
  forEachVisibleElement(html, (tag) => {
    const id = readNodeId(tag.attributes);
    if (id && !seen.has(id)) {
      seen.add(id);
      return;
    }
    const nameEnd = tag.start + 1 + tag.name.length;
    const attribute = ` ${NODE_ID_ATTRIBUTE}="${nextId()}"`;
    if (id) {
      // A duplicate: swap its id for the new one in place.
      const match = NODE_ID_PATTERN.exec(tag.attributes);
      if (!match) return;
      const start = nameEnd + match.index;
      edits.push({ start, end: start + match[0].length, text: attribute });
    } else {
      edits.push({ start: nameEnd, end: nameEnd, text: attribute });
    }
  });

  let result = html;
  for (const edit of edits.reverse()) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
};

export interface NodeSpan {
  /** Start of the opening tag. */
  start: number;
  /** End of the opening tag, where the content starts. */
  openEnd: number;
  /** Start of the closing tag, where the content ends. Equals `openEnd` for a void element. */
  closeStart: number;
  /** End of the closing tag. */
  end: number;
}

/** Where the element with `nodeId` sits in `html`, or null when it is not there. */
export const findNodeSpan = (html: string, nodeId: string): NodeSpan | null => {
  const tags = scanTags(html);
  for (const tag of tags) {
    if (tag.isClosing || readNodeId(tag.attributes) !== nodeId) continue;
    const close = findElementClose(tag, tags);
    return close ? { start: tag.start, openEnd: tag.end, ...close } : null;
  }
  return null;
};

/** The element's exact source, or null when it is not in the page. */
export const getNodeHtml = (html: string, nodeId: string) => {
  const span = findNodeSpan(html, nodeId);
  return span ? html.slice(span.start, span.end) : null;
};

// Past this the element is most of the page, so the model gets its opening tag
// to locate it and reads the rest from the page HTML it already has.
const MAX_SCOPED_NODE_CHARS = 20_000;

/**
 * Narrows a page edit prompt to one element. Returns the prompt unchanged when
 * the element is not in `html`, so a stale pick falls back to a page edit.
 */
export const scopePromptToNode = (prompt: string, html: string, nodeId: string) => {
  const span = nodeId ? findNodeSpan(html, nodeId) : null;
  if (!span) return prompt;
  const source =
    span.end - span.start > MAX_SCOPED_NODE_CHARS
      ? html.slice(span.start, span.openEnd)
      : html.slice(span.start, span.end);
  return [
    prompt,
    "",
    `Apply this only to the element with ${NODE_ID_ATTRIBUTE}="${nodeId}" shown below. ` +
      `Leave the rest of the page exactly as it is, and keep that ${NODE_ID_ATTRIBUTE} attribute.`,
    source,
  ].join("\n");
};

/** The editor URL for one element, which an MCP agent resolves with get_page's nodeId. */
export const buildNodeLink = ({
  origin,
  projectId,
  pageId,
  nodeId,
}: {
  origin: string;
  projectId: string;
  pageId: string;
  nodeId: string;
}) =>
  `${origin}/wire/${encodeURIComponent(projectId)}?page=${encodeURIComponent(pageId)}&node=${encodeURIComponent(nodeId)}`;

/** Reads the page and element an editor URL points at. */
export const readNodeLink = (search: string) => {
  const params = new URLSearchParams(search);
  const pageId = params.get("page");
  if (!pageId) return null;
  const nodeId = params.get("node");
  return { pageId, nodeId: nodeId && NODE_ID_FORMAT.test(nodeId) ? nodeId : null };
};

const escapeText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The entities generated copy uses. Text with any other named entity is left
// read-only rather than saved back wrong.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  middot: "\u00b7",
  bull: "\u2022",
  times: "\u00d7",
  rarr: "\u2192",
  larr: "\u2190",
  euro: "\u20ac",
  pound: "\u00a3",
};

/** Decodes text content, or null when it holds an entity this does not know. */
const decodeText = (value: string) => {
  let unknown = false;
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      if (Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff) {
        return String.fromCodePoint(code);
      }
    } else if (name.toLowerCase() in NAMED_ENTITIES) {
      return NAMED_ENTITIES[name.toLowerCase()];
    }
    unknown = true;
    return entity;
  });
  return unknown ? null : decoded;
};

/**
 * The element's text when its content is text only, which is the case the
 * inspector can edit without a model. Null for an element with child tags.
 */
export const getNodeText = (html: string, nodeId: string) => {
  const span = findNodeSpan(html, nodeId);
  if (!span || span.closeStart === span.openEnd) return null;
  const content = html.slice(span.openEnd, span.closeStart);
  return content.includes("<") ? null : (decodeText(content)?.trim() ?? null);
};

/** Replaces a text-only element's content with `text`. Null when the element cannot take it. */
export const setNodeText = (html: string, nodeId: string, text: string) => {
  if (getNodeText(html, nodeId) === null) return null;
  const span = findNodeSpan(html, nodeId);
  if (!span) return null;
  return html.slice(0, span.openEnd) + escapeText(text) + html.slice(span.closeStart);
};

export type NodeColorProperty = "text" | "bg";

const TAILWIND_COLOR_NAMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

// Unprefixed color utilities only: `hover:text-white` and `text-lg` stay.
const colorClassPattern = (property: NodeColorProperty) =>
  new RegExp(
    `^${property}-(?:(?:${TAILWIND_COLOR_NAMES})-\\d{2,3}|white|black|transparent|current|inherit|\\[(?:#|rgb|hsl|oklch|color)[^\\]]*\\])(?:\\/\\S+)?$`,
  );

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Sets the element's text or background color by swapping its Tailwind color
 * class for an arbitrary value, matching how generated pages are styled. A
 * null color removes the override, which is the way back.
 */
export const setNodeColor = (
  html: string,
  nodeId: string,
  property: NodeColorProperty,
  color: string | null,
) => {
  if (color !== null && !HEX_COLOR.test(color)) return null;
  const span = findNodeSpan(html, nodeId);
  if (!span) return null;

  const openTag = html.slice(span.start, span.openEnd);
  const classMatch = /\sclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(openTag);
  if (!classMatch && color === null) return html;
  const classes = (classMatch?.[2] ?? classMatch?.[3] ?? "").split(/\s+/).filter(Boolean);
  const pattern = colorClassPattern(property);
  const nextClasses = [
    ...classes.filter((name) => !pattern.test(name)),
    ...(color ? [`${property}-[${color.toLowerCase()}]`] : []),
  ].join(" ");

  const nextOpenTag = classMatch
    ? openTag.slice(0, classMatch.index) +
      ` class="${nextClasses}"` +
      openTag.slice(classMatch.index + classMatch[0].length)
    : openTag.replace(/\s*\/?>$/, (end) => ` class="${nextClasses}"${end}`);
  return html.slice(0, span.start) + nextOpenTag + html.slice(span.openEnd);
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Sets one attribute on the element's opening tag, adding it when missing. Null when the element is gone. */
export const setNodeAttribute = (html: string, nodeId: string, name: string, value: string) => {
  const span = findNodeSpan(html, nodeId);
  if (!span) return null;
  const openTag = html.slice(span.start, span.openEnd);
  const attribute = ` ${name}="${escapeAttribute(value)}"`;
  const match = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i").exec(openTag);
  const nextOpenTag = match
    ? openTag.slice(0, match.index) + attribute + openTag.slice(match.index + match[0].length)
    : openTag.replace(/\s*\/?>$/, (end) => `${attribute}${end}`);
  return html.slice(0, span.start) + nextOpenTag + html.slice(span.openEnd);
};

/** One attribute's value on the element's opening tag, or null. */
export const getNodeAttribute = (html: string, nodeId: string, name: string) => {
  const span = findNodeSpan(html, nodeId);
  if (!span) return null;
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(
    html.slice(span.start, span.openEnd),
  );
  return match ? (match[2] ?? match[3] ?? "") : null;
};

/** The inline style properties the inspector edits, and the values each accepts. */
export const NODE_STYLE_PROPERTIES = {
  width: /^\d{1,4}(?:\.\d{1,2})?px$/,
  height: /^\d{1,4}(?:\.\d{1,2})?px$/,
  opacity: /^(?:0(?:\.\d{1,2})?|1)$/,
  "font-size": /^\d{1,3}(?:\.\d{1,2})?px$/,
  "font-weight": /^[1-9]00$/,
  "padding-block": /^\d{1,3}(?:\.\d{1,2})?px$/,
  "padding-inline": /^\d{1,3}(?:\.\d{1,2})?px$/,
  gap: /^\d{1,3}(?:\.\d{1,2})?px$/,
  "border-radius": /^\d{1,4}(?:\.\d{1,2})?px$/,
} as const;

export type NodeStyleProperty = keyof typeof NODE_STYLE_PROPERTIES;

const unescapeAttribute = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Splits a style attribute on the semicolons that end declarations, not those inside url() or quotes. */
const splitDeclarations = (style: string) => {
  const declarations: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let index = 0; index < style.length; index += 1) {
    const char = style[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      declarations.push(style.slice(start, index));
      start = index + 1;
    }
  }
  declarations.push(style.slice(start));
  return declarations.map((declaration) => declaration.trim()).filter(Boolean);
};

const declarationName = (declaration: string) =>
  declaration.slice(0, declaration.indexOf(":")).trim().toLowerCase();

/** The inline values the inspector set on the element, by property. */
export const getNodeStyle = (html: string, nodeId: string) => {
  const style = unescapeAttribute(getNodeAttribute(html, nodeId, "style") ?? "");
  const values: Partial<Record<NodeStyleProperty, string>> = {};
  for (const declaration of splitDeclarations(style)) {
    const name = declarationName(declaration);
    if (name in NODE_STYLE_PROPERTIES) {
      values[name as NodeStyleProperty] = declaration.slice(declaration.indexOf(":") + 1).trim();
    }
  }
  return values;
};

/**
 * Sets one inline style declaration on the element, or removes it when `value`
 * is null. Inline so it wins over the page's classes whether or not the page
 * uses Tailwind. Null when the element is gone or the value is not allowed.
 */
export const setNodeStyle = (
  html: string,
  nodeId: string,
  property: NodeStyleProperty,
  value: string | null,
) => {
  if (value !== null && !NODE_STYLE_PROPERTIES[property].test(value)) return null;
  const current = getNodeAttribute(html, nodeId, "style");
  if (current === null && findNodeSpan(html, nodeId) === null) return null;
  const declarations = splitDeclarations(unescapeAttribute(current ?? "")).filter(
    (declaration) => declarationName(declaration) !== property,
  );
  if (value !== null) declarations.push(`${property}: ${value}`);
  if (declarations.length === 0 && current === null) return html;
  return setNodeAttribute(html, nodeId, "style", declarations.join("; "));
};

interface NodeSummary {
  openTag: string;
  /** The content of an element with no child tags, which is its text. */
  text: string | null;
}

/** Every element with a node id, in one pass, keyed by id. */
const summarizeNodes = (html: string) => {
  const nodes = new Map<string, NodeSummary>();
  const open: Array<{ name: string; id: string | null; openEnd: number }> = [];
  for (const tag of scanTags(html)) {
    if (!tag.isClosing) {
      const id = readNodeId(tag.attributes);
      if (id && !nodes.has(id)) {
        nodes.set(id, { openTag: html.slice(tag.start, tag.end), text: null });
      }
      if (!isSelfClosing(tag)) open.push({ name: tag.name, id, openEnd: tag.end });
      continue;
    }
    const index = open.findLastIndex((entry) => entry.name === tag.name);
    if (index === -1) continue;
    const [entry] = open.splice(index);
    const node = entry.id ? nodes.get(entry.id) : undefined;
    const content = html.slice(entry.openEnd, tag.start);
    if (node && !content.includes("<")) node.text = content.trim();
  }
  return nodes;
};

export interface NodeChange {
  nodeId: string;
  /** The opening tag and text before, or null when the element is new. */
  before: string | null;
  /** The opening tag and text now, or null when the element was removed. */
  after: string | null;
}

const describeNode = (node: NodeSummary) =>
  node.text ? `${node.openTag}${node.text}` : node.openTag;

/**
 * The elements whose opening tag or text differ between two versions of a
 * page, matched by node id. Both sides are stamped first, so HTML saved before
 * the editor stamped it still lines up with the stamped version.
 */
export const diffPageNodes = (beforeHtml: string, afterHtml: string): NodeChange[] => {
  const before = summarizeNodes(stampNodeIds(beforeHtml));
  const after = summarizeNodes(stampNodeIds(afterHtml));
  const changes: NodeChange[] = [];
  for (const [nodeId, node] of before) {
    const next = after.get(nodeId);
    if (!next) {
      changes.push({ nodeId, before: describeNode(node), after: null });
    } else if (describeNode(node) !== describeNode(next)) {
      changes.push({ nodeId, before: describeNode(node), after: describeNode(next) });
    }
  }
  for (const [nodeId, node] of after) {
    if (!before.has(nodeId)) changes.push({ nodeId, before: null, after: describeNode(node) });
  }
  return changes;
};
