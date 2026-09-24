/**
 * Finds the element an agent just changed so the canvas can point a cursor at
 * it. PageRenderer diffs the previous and next srcdoc strings, tags one opening
 * tag with `data-wirely-cursor`, and the in-frame reporter posts that element's
 * rect back. The attribute only ever exists in the srcdoc handed to the
 * iframe, never in stored page HTML.
 */

export const AGENT_CURSOR_ATTRIBUTE = "data-wirely-cursor";

// Tags with no box of their own, or whose content is not page markup.
const INVISIBLE_TAGS = new Set([
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

const OPENING_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;

const firstDifference = (previous: string, next: string) => {
  const limit = Math.min(previous.length, next.length);
  let index = 0;
  while (index < limit && previous.charCodeAt(index) === next.charCodeAt(index)) index += 1;
  return index;
};

/**
 * Marks the element at the start of the changed region. The first visible
 * opening tag inside the region wins, because a patch or a streamed chunk
 * usually opens with the outermost new element. A change with no new tag, such
 * as edited text or a class, falls back to the nearest opening tag before it.
 */
export const markAgentCursor = (
  previousHtml: string,
  nextHtml: string,
): { html: string; found: boolean } => {
  const unchanged = { html: nextHtml, found: false };
  if (previousHtml === nextHtml) return unchanged;

  let changeStart = firstDifference(previousHtml, nextHtml);
  // A difference inside a tag belongs to that tag. Without this, "</body>"
  // becoming "<section>" would diff after the shared "<" and miss the section.
  const lastOpen = nextHtml.lastIndexOf("<", changeStart - 1);
  if (changeStart > 0 && lastOpen > nextHtml.lastIndexOf(">", changeStart - 1)) {
    changeStart = lastOpen;
  }
  const maxSuffix = Math.min(previousHtml.length, nextHtml.length) - changeStart;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    previousHtml.charCodeAt(previousHtml.length - 1 - suffix) ===
      nextHtml.charCodeAt(nextHtml.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  const changeEnd = nextHtml.length - suffix;

  const bodyMatch = /<body\b[^>]*>/i.exec(nextHtml);
  if (!bodyMatch) return unchanged;

  let before: { index: number; name: string } | null = null;
  let inside: { index: number; name: string } | null = null;
  OPENING_TAG.lastIndex = bodyMatch.index + bodyMatch[0].length;

  for (let match = OPENING_TAG.exec(nextHtml); match; match = OPENING_TAG.exec(nextHtml)) {
    const name = match[1].toLowerCase();
    if (name === "script" || name === "style") {
      // Markup inside a script string is not an element; skip to its close.
      const close = nextHtml.toLowerCase().indexOf(`</${name}`, OPENING_TAG.lastIndex);
      if (close === -1) break;
      OPENING_TAG.lastIndex = close;
      continue;
    }
    if (INVISIBLE_TAGS.has(name)) continue;
    if (match.index >= changeEnd) break;
    if (match.index >= changeStart) {
      inside = { index: match.index, name };
      break;
    }
    before = { index: match.index, name };
  }

  const target = inside ?? before;
  if (!target) return unchanged;

  const insertAt = target.index + 1 + target.name.length;
  return {
    html: `${nextHtml.slice(0, insertAt)} ${AGENT_CURSOR_ATTRIBUTE}${nextHtml.slice(insertAt)}`,
    found: true,
  };
};
