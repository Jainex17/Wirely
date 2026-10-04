/**
 * Turns a page's HTML into inert DOM for a canvas frame: elements and text
 * with no scripts, handlers, forms, frames, or fetches outside the image
 * allowlist, styled by its sanitized CSS. The canvas mounts the result in a
 * shadow root inside the editor's document instead of a sandboxed iframe, so
 * this function is the trust boundary for every idle page on the canvas.
 *
 * The HTML is parsed with DOMParser, whose documents run no scripts and load
 * nothing, and DOMPurify walks the parsed nodes and returns a fragment. Nothing
 * is serialized and parsed again, so markup cannot change meaning in between.
 * The live iframe path in `lib/iframeSecurity.ts` is separate and unchanged.
 */
import DOMPurify, { type WindowLike } from "dompurify";
import {
  INERT_BODY_ATTRIBUTE,
  INERT_FRAME_ATTRIBUTE,
  INERT_HTML_ATTRIBUTE,
  inertBaseCss,
  inertCustomPropertyResets,
  isInertImageUrl,
  sanitizeInertCss,
  sanitizeInertDeclarations,
  type InertViewport,
} from "@/lib/inertCss";

/**
 * The one stylesheet a page may link: the icon font the generation prompts
 * emit, at that exact URL. The canvas also links it from the editor's own
 * document, since browsers ignore @font-face in a shadow root, so it carries a
 * subresource integrity hash and a changed file never loads.
 */
export const INERT_ICON_STYLESHEET = {
  href: "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css",
  integrity: "sha384-XGjxtQfXaH2tnPFa9x+ruJTuLE3Aa6LhHSWRr1XeTyhezb4abCG4ccI5AkVDxqC+",
};

// Removed with everything inside them. The interactive ones match the live
// frame, whose sanitizer drops them too, so both renders show the same page.
/** A link to the icon stylesheet, checked against its integrity hash. */
export const createIconStylesheet = (owner: Document) => {
  const link = owner.createElement("link");
  link.rel = "stylesheet";
  link.href = INERT_ICON_STYLESHEET.href;
  link.setAttribute("integrity", INERT_ICON_STYLESHEET.integrity);
  link.crossOrigin = "anonymous";
  return link;
};

const FORBID_WITH_CONTENTS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "button",
  "select",
  "textarea",
  "video",
  "audio",
  "foreignobject",
];
const FORBID_TAGS = [
  ...FORBID_WITH_CONTENTS,
  "input",
  "base",
  "meta",
  "link",
  "track",
  "area",
  "map",
  "portal",
  "slot",
  "marquee",
  // SVG motion repaints forever and ignores the CSS that holds animations still.
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
];
const FORBID_ATTR = [
  "srcdoc",
  "formaction",
  "action",
  "autofocus",
  "tabindex",
  "accesskey",
  "contenteditable",
  "popover",
  "popovertarget",
  "popovertargetaction",
  "target",
  "download",
  "ping",
  "is",
  "slot",
  "part",
  "exportparts",
  "shadowroot",
  "shadowrootmode",
];

// Attributes whose value is a URL. Only the image sources below survive, and
// SVG references into the page itself.
const URL_ATTRIBUTES = new Set([
  "href",
  "xlink:href",
  "src",
  "srcset",
  "background",
  "poster",
  "action",
  "formaction",
  "data",
  "codebase",
  "cite",
  "longdesc",
  "lowsrc",
  "dynsrc",
  "ping",
  "icon",
  "manifest",
  "profile",
  "archive",
  "classid",
  "usemap",
]);
// Text attributes no browser reads as CSS, so parentheses in them are just text.
const TEXT_ATTRIBUTE = /^(?:class|id|alt|title|lang|dir|role|name|d|points|viewbox|aria-.*|data-.*)$/;

/**
 * The URLs in a srcset, read the way a browser reads them: a candidate's URL
 * runs to the next ASCII whitespace, commas and no-break spaces included, and
 * only a comma at its end separates it from the next candidate.
 */
export const srcsetUrls = (value: string) => {
  const urls: string[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\t\n\f\r ,]/.test(value[i])) i += 1;
    if (i >= value.length) break;
    const start = i;
    while (i < value.length && !/[\t\n\f\r ]/.test(value[i])) i += 1;
    let url = value.slice(start, i);
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      // Descriptors run to the next comma outside parentheses.
      let depth = 0;
      for (; i < value.length && (depth > 0 || value[i] !== ","); i += 1) {
        if (value[i] === "(") depth += 1;
        if (value[i] === ")") depth = Math.max(0, depth - 1);
      }
    }
    urls.push(url);
  }
  return urls;
};

const isAllowedSrcset = (value: string) => {
  const urls = srcsetUrls(value);
  return urls.length > 0 && urls.every(isInertImageUrl);
};

const isAllowedUrlAttribute = (tag: string, name: string, value: string) => {
  if (name === "src") return (tag === "img" || tag === "source") && isInertImageUrl(value);
  if (name === "srcset") return (tag === "img" || tag === "source") && isAllowedSrcset(value);
  if (name !== "href" && name !== "xlink:href") return false;
  // An inert frame never navigates, so links lose their target.
  if (tag === "a") return false;
  if (tag === "image" || tag === "feimage") return isInertImageUrl(value);
  return value.trim().startsWith("#");
};

const copyRootAttributes = (from: Element, to: Element) => {
  for (const { name, value } of Array.from(from.attributes)) {
    if (/^(?:class|style|dir|lang|data-[a-z0-9_.-]+)$/.test(name)) to.setAttribute(name, value);
  }
};

// What a browser with scripts on applies: not Tailwind source blocks, and
// nothing inside <noscript>, which a DOMParser document parses as markup.
const isAppliedStyle = (style: Element) =>
  !style.closest("noscript") &&
  /^(?:text\/css)?$/i.test((style.getAttribute("type") ?? "").trim()) &&
  /^(?:all|screen)?$/i.test((style.getAttribute("media") ?? "").trim());

/**
 * Inert content for one page's shadow root: its stylesheet, any allowlisted
 * stylesheet links, and the page itself under two wrapper elements standing in
 * for `html` and `body`. `linksIconFont` says the page links the icon font,
 * which the caller also links from the document. `win` is the window to build in, which tests swap for jsdom.
 */
export const buildInertPage = (html: string, viewport: InertViewport, win: WindowLike = window) => {
  // Parsing raw HTML here loads nothing. A DOMParser document has no browsing
  // context, so scripts never run, an <img> waits for its document to become
  // fully active before fetching, which never happens, and a <link> or a
  // stylesheet's @import fetches only once browsing-context connected. Only
  // the sanitized fragment ever enters the editor's document. DOMPurify parses
  // the same way for the same reason.
  const doc = new win.DOMParser().parseFromString(html, "text/html");
  const css = Array.from(doc.querySelectorAll("style"))
    .filter(isAppliedStyle)
    .map((style) => style.textContent ?? "")
    .join("\n");
  const linksIconFont = Array.from(doc.querySelectorAll("link")).some(
    (link) =>
      /(?:^|\s)stylesheet(?:\s|$)/i.test(link.getAttribute("rel") ?? "") &&
      (link.getAttribute("href") ?? "").trim() === INERT_ICON_STYLESHEET.href,
  );

  const htmlWrapper = doc.createElement("div");
  const bodyWrapper = doc.createElement("div");
  copyRootAttributes(doc.documentElement, htmlWrapper);
  copyRootAttributes(doc.body, bodyWrapper);
  htmlWrapper.setAttribute(INERT_HTML_ATTRIBUTE, "");
  bodyWrapper.setAttribute(INERT_BODY_ATTRIBUTE, "");
  bodyWrapper.append(...Array.from(doc.body.childNodes));
  htmlWrapper.append(bodyWrapper);
  const frame = doc.createElement("div");
  frame.setAttribute(INERT_FRAME_ATTRIBUTE, "");
  frame.append(htmlWrapper);

  const customProperties = new Set<string>();
  const purify = DOMPurify(win);
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    const tag = node.nodeName.toLowerCase();
    const name = data.attrName;
    if (name === "style") {
      data.attrValue = sanitizeInertDeclarations(data.attrValue, viewport, customProperties);
    } else if (URL_ATTRIBUTES.has(name)) {
      data.keepAttr = isAllowedUrlAttribute(tag, name, data.attrValue);
    } else if (!TEXT_ATTRIBUTE.test(name) && /[(\\]/.test(data.attrValue)) {
      // SVG presentation attributes such as fill="url(...)" are CSS values.
      data.attrValue = sanitizeInertDeclarations(data.attrValue, viewport, customProperties);
    }
  });
  const content = purify.sanitize(frame, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    // Vector pages reuse shapes with <use>; its href may only point into the page.
    ADD_TAGS: ["use"],
    FORBID_TAGS,
    FORBID_ATTR,
    ADD_FORBID_CONTENTS: FORBID_WITH_CONTENTS,
    RETURN_DOM_FRAGMENT: true,
  });

  const owner = content.ownerDocument ?? doc;
  const style = owner.createElement("style");
  const pageCss = sanitizeInertCss(css, viewport, customProperties);
  style.textContent = inertBaseCss(viewport) + inertCustomPropertyResets(customProperties) + pageCss;
  content.prepend(style);
  if (linksIconFont) content.prepend(createIconStylesheet(owner));
  return { content, linksIconFont };
};
