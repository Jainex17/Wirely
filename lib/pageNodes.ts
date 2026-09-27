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
// page and let a click pick a path instead of the icon.
const OPAQUE_TAGS = new Set(["svg"]);

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
    if (OPAQUE_TAGS.has(tag.name) && !isSelfClosing(tag)) {
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
