/**
 * Vector pages. A page with `deviceType: "vector"` is one SVG artboard of any
 * size: an icon, a logo, an illustration, a social card. Its frame on the
 * canvas takes the artboard's own size instead of a device width.
 *
 * The artboard is the <svg> carrying `data-wirely-artboard`. `prepareArtboardHtml`
 * adds that marker and a reset style when an agent writes the page, so every
 * renderer (canvas, share, thumbnail, screenshot) draws the artboard at the
 * top left of the frame with no body margin. The marker also tells
 * `stampNodeIds` to give the artboard's paths their own ids, so the pen tool
 * can edit them one at a time.
 */
import type { Matrix } from "@/lib/vectorPath";

export const ARTBOARD_ATTRIBUTE = "data-wirely-artboard";

const ARTBOARD_STYLE = `<style ${ARTBOARD_ATTRIBUTE}>html,body{margin:0;background:transparent}svg[${ARTBOARD_ATTRIBUTE}]{display:block}</style>`;

const DEFAULT_ARTBOARD_SIZE = 1024;
const MIN_ARTBOARD_SIZE = 16;
const MAX_ARTBOARD_SIZE = 8192;

const ARTBOARD_TAG = new RegExp(`<svg\\b(?:"[^"]*"|'[^']*'|[^'">])*\\s${ARTBOARD_ATTRIBUTE}\\b(?:"[^"]*"|'[^']*'|[^'">])*>`, "i");

/** An SVG file rather than an HTML page, as an agent writes an icon or a logo. */
export const isSvgDocument = (html: string) =>
  /^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype svg[^>]*>\s*)?<svg\b/i.test(html);

/** Marks the first <svg> as the artboard and adds the reset style in front of it. Idempotent. */
export const prepareArtboardHtml = (html: string) => {
  if (ARTBOARD_TAG.test(html)) return html;
  const cleaned = html.replace(/<\?xml[^>]*\?>/gi, "").replace(/<!doctype svg[^>]*>/gi, "");
  const svgStart = cleaned.search(/<svg\b/i);
  if (svgStart === -1) return html;
  const nameEnd = svgStart + "<svg".length;
  return (
    cleaned.slice(0, svgStart) +
    ARTBOARD_STYLE +
    cleaned.slice(svgStart, nameEnd) +
    ` ${ARTBOARD_ATTRIBUTE}` +
    cleaned.slice(nameEnd)
  );
};

const readAttribute = (tag: string, name: string) => {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? "").trim() : null;
};

/** A length in px, or null for a percentage or any other unit the frame cannot size to. */
const readPxLength = (value: string | null) => {
  const match = value ? /^(\d*\.?\d+)(px)?$/i.exec(value) : null;
  return match ? Number.parseFloat(match[1]) : null;
};

const readViewBox = (tag: string) => {
  const parts = (readAttribute(tag, "viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) {
    return null;
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
};

const clampSize = (value: number) =>
  Math.round(Math.min(MAX_ARTBOARD_SIZE, Math.max(MIN_ARTBOARD_SIZE, value)));

const readArtboardTag = (html: string) => ARTBOARD_TAG.exec(html)?.[0] ?? null;

/**
 * The artboard's size in page px. A missing side follows the viewBox's aspect
 * ratio, the way a browser sizes an <svg> with one dimension set.
 */
export const readArtboardSize = (html: string) => {
  const tag = readArtboardTag(html);
  const viewBox = tag ? readViewBox(tag) : null;
  const width = tag ? readPxLength(readAttribute(tag, "width")) : null;
  const height = tag ? readPxLength(readAttribute(tag, "height")) : null;
  const aspect = viewBox ? viewBox.height / viewBox.width : 1;
  const resolvedWidth = width ?? (height !== null ? height / aspect : (viewBox?.width ?? DEFAULT_ARTBOARD_SIZE));
  const resolvedHeight = height ?? resolvedWidth * aspect;
  return { width: clampSize(resolvedWidth), height: clampSize(resolvedHeight) };
};

/**
 * Maps the artboard's user units to page px, so the pen tool can place a
 * point where the pointer is. Anything but `preserveAspectRatio="none"` is
 * treated as the default, xMidYMid meet.
 */
// ponytail: other preserveAspectRatio alignments fall back to xMidYMid; parse them if agents use them.
export const getArtboardMatrix = (html: string): Matrix => {
  const tag = readArtboardTag(html);
  const viewBox = tag ? readViewBox(tag) : null;
  if (!tag || !viewBox) return [1, 0, 0, 1, 0, 0];
  const { width, height } = readArtboardSize(html);
  const stretch = /^\s*none\b/i.test(readAttribute(tag, "preserveAspectRatio") ?? "");
  const scaleX = width / viewBox.width;
  const scaleY = height / viewBox.height;
  const sx = stretch ? scaleX : Math.min(scaleX, scaleY);
  const sy = stretch ? scaleY : sx;
  return [
    sx,
    0,
    0,
    sy,
    -viewBox.x * sx + (width - viewBox.width * sx) / 2,
    -viewBox.y * sy + (height - viewBox.height * sy) / 2,
  ];
};

/** Where the artboard element sits, counting nested <svg>s so an inner one does not end it. */
const findArtboardSpan = (html: string) => {
  const open = ARTBOARD_TAG.exec(html);
  if (!open) return null;
  const pattern = /<(\/?)svg\b(?:"[^"]*"|'[^']*'|[^'">])*?(\/?)>/gi;
  pattern.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (match[2]) continue;
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      return { start: open.index, closeStart: match.index, end: match.index + match[0].length };
    }
  }
  return null;
};

/** Adds markup as the artboard's last child, so it draws on top. Null when there is no artboard. */
export const appendToArtboard = (html: string, markup: string) => {
  const span = findArtboardSpan(html);
  return span ? html.slice(0, span.closeStart) + markup + html.slice(span.closeStart) : null;
};

/**
 * Adds a pen stroke to a page. On a vector page it joins the artboard. On an
 * HTML page it goes before </body> in its own <svg>, positioned at the
 * document's top left with no viewBox, so path units are page px and the
 * stroke lands where it was drawn.
 */
export const appendPenPath = (html: string, pathMarkup: string) => {
  const onArtboard = appendToArtboard(html, pathMarkup);
  if (onArtboard !== null) return onArtboard;
  const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" style="position:absolute;left:0;top:0;overflow:visible;z-index:2147483647">${pathMarkup}</svg>`;
  const bodyEnd = html.search(/<\/body>/i);
  return bodyEnd === -1 ? html + drawing : html.slice(0, bodyEnd) + drawing + html.slice(bodyEnd);
};

/** The artboard as a standalone .svg file, with Wirely's ids and marker removed. */
export const exportArtboardSvg = (html: string) => {
  const span = findArtboardSpan(html);
  if (!span) return null;
  const svg = html
    .slice(span.start, span.end)
    .replace(/\sdata-wirely-[a-z0-9-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
  return /\sxmlns\s*=/.test(svg.slice(0, svg.indexOf(">")))
    ? svg
    : svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
};
