/**
 * Still pictures of canvas pages. A page that is small on screen draws as one
 * JPEG instead of its DOM, so panning and zooming a canvas of 300 pages costs
 * the browser about what 3 cost: it scales pictures instead of painting every
 * element of every page again at each new zoom.
 *
 * A snapshot is drawn from a page's inert DOM, which `lib/inertPage.ts` has
 * already sanitized. A copy of the DOM is serialized into an SVG
 * <foreignObject> and loaded as an image. An SVG image runs no scripts and
 * loads nothing, so the page's images and the icon font are fetched here first
 * and swapped in as data URLs. A page with an image that cannot be fetched gets
 * no snapshot and keeps drawing as DOM, so a snapshot never shows a page with
 * holes in it.
 */
import { ASSET_PATH_PATTERN } from "@/lib/assetPaths";
import { SNAPSHOT_SCALE } from "@/lib/canvasScene";
import { INERT_ICON_STYLESHEET } from "@/lib/inertPage";
import { INERT_FRAME_ATTRIBUTE, isInertImageUrl } from "@/lib/inertCss";

// Browsers refuse canvases much past this on a side, so a very tall page
// snapshots at a lower scale.
const MAX_SNAPSHOT_SIDE = 16_000;
const MAX_INLINED_BYTES = 8 * 1024 * 1024;
const JPEG_QUALITY = 0.9;
// An image that never loads, such as a lazy one off screen, must not hold the
// capture queue forever. Neither may a server that never finishes a response.
const IMAGE_WAIT_MS = 3_000;
const FETCH_TIMEOUT_MS = 10_000;

export const snapshotScale = (height: number) =>
  Math.min(SNAPSHOT_SCALE, MAX_SNAPSHOT_SIDE / Math.max(1, height));

// The inert sanitizer writes every CSS url as url("..."), in stylesheets and in
// style attributes alike.
const CSS_URL = /url\(\s*"([^"\\]*)"\s*\)/g;
const URL_ATTRIBUTES = new Set(["src", "href", "xlink:href"]);
// Font files left in the text of @font-face rules the inert sanitizer
// disabled. They never load, so they are never fetched.
const FONT_FILE = /\.(?:woff2?|ttf|otf|eot)(?:[?#]|$)/i;

/** A URL the page loads from somewhere: an https image or a project asset. */
const isFetchable = (url: string) =>
  (/^https:/i.test(url) || ASSET_PATH_PATTERN.test(url)) && isInertImageUrl(url) && !FONT_FILE.test(url);

const cssUrls = (css: string) => Array.from(css.matchAll(CSS_URL), (match) => match[1]);

const swapCssUrls = (css: string, dataUrls: ReadonlyMap<string, string>) =>
  css.replace(CSS_URL, (whole, url: string) => {
    const dataUrl = dataUrls.get(url);
    return dataUrl ? `url("${dataUrl}")` : whole;
  });

// Chromium flattens 3D when it draws a page into an image, so a card turned
// with backface-visibility shows its back. Such a page keeps drawing as DOM.
const FLATTENED_3D = /preserve-3d|backface-visibility/i;

/** Whether the snapshot would draw the page differently from its DOM. */
export const drawsDifferentlyAsImage = (css: string, markup: string) =>
  FLATTENED_3D.test(css) || FLATTENED_3D.test(markup);

const elementsOf = (root: Element) => [root, ...Array.from(root.querySelectorAll("*"))];

/**
 * The URL an image shows. With a srcset or a <picture>, that is the candidate
 * the browser picked, which can be a different picture from the src.
 */
const shownSource = (element: Element) => {
  const src = element.getAttribute("src")?.trim() ?? "";
  const hasCandidates = element.hasAttribute("srcset") || element.parentElement?.localName === "picture";
  const current = element.localName === "img" && hasCandidates ? (element as HTMLImageElement).currentSrc : "";
  if (!current) return src;
  const url = new URL(current);
  // A project asset picked from a srcset comes back absolute.
  return url.origin === element.ownerDocument.defaultView?.location.origin ? url.pathname : current;
};

/** Every image URL the page's CSS and elements load. */
export const collectImageUrls = (frame: Element, css: string) => {
  const urls = new Set(cssUrls(css));
  for (const element of elementsOf(frame)) {
    for (const attribute of Array.from(element.attributes)) {
      if (URL_ATTRIBUTES.has(attribute.name)) {
        urls.add(attribute.name === "src" ? shownSource(element) : attribute.value.trim());
      }
      if (attribute.name === "style") cssUrls(attribute.value).forEach((url) => urls.add(url));
    }
  }
  return [...urls].filter(isFetchable);
};

/**
 * The page's markup with each URL in `dataUrls` swapped in, serialized as
 * XHTML. It works on a copy, so the swap goes through the DOM and the
 * serializer escapes whatever a URL holds. It also drops what an SVG image
 * would try to load on its own and fail: srcset and <source> candidates, so
 * each image's src becomes the candidate the page shows, and lazy loading,
 * which never fires in an image.
 */
export const snapshotMarkup = (frame: Element, dataUrls: ReadonlyMap<string, string>) => {
  const copy = frame.cloneNode(true) as Element;
  const originals = elementsOf(frame);
  for (const [index, element] of elementsOf(copy).entries()) {
    const shown = element.localName === "img" ? shownSource(originals[index]) : "";
    if (shown) element.setAttribute("src", shown);
    for (const name of ["srcset", "sizes", "loading"]) element.removeAttribute(name);
    for (const attribute of Array.from(element.attributes)) {
      const dataUrl = URL_ATTRIBUTES.has(attribute.name) ? dataUrls.get(attribute.value.trim()) : undefined;
      if (dataUrl) attribute.value = dataUrl;
      if (attribute.name === "style") attribute.value = swapCssUrls(attribute.value, dataUrls);
    }
  }
  copy.querySelectorAll("source").forEach((source) => source.remove());
  const view = frame.ownerDocument.defaultView ?? window;
  return new view.XMLSerializer().serializeToString(copy);
};

/**
 * The SVG document a snapshot is drawn from. The CSS goes in as escaped XML
 * text, so a `<` or `&` in it cannot end the style element or start markup.
 */
export const buildSnapshotSvg = ({
  css,
  markup,
  width,
  height,
  dataUrls,
}: {
  css: string;
  markup: string;
  width: number;
  height: number;
  dataUrls: ReadonlyMap<string, string>;
}) => {
  const escapedCss = swapCssUrls(css, dataUrls).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden">` +
    `<style>${escapedCss}</style>${markup}</div></foreignObject></svg>`
  );
};

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Pages share images, a logo or an avatar, so recent data URLs are kept up to
// a budget, oldest out first. A failure is not kept, so the next capture
// tries that image again.
const MAX_CACHED_CHARS = 32 * 1024 * 1024;
const inlined = new Map<string, Promise<string | null>>();
let cachedChars = 0;
const sizes = new Map<string, number>();
const keep = (url: string, dataUrl: string | null) => {
  if (!dataUrl) {
    inlined.delete(url);
    return;
  }
  sizes.set(url, dataUrl.length);
  cachedChars += dataUrl.length;
  for (const [oldest, size] of sizes) {
    if (cachedChars <= MAX_CACHED_CHARS) break;
    sizes.delete(oldest);
    inlined.delete(oldest);
    cachedChars -= size;
  }
};

/**
 * The file at `url` as a data URL, or null when it cannot be fetched or is not
 * of a type `accept` allows. A browser still draws an image served with the
 * wrong type, so either way the page keeps drawing as DOM.
 */
const fetchDataUrl = (url: string, accept: RegExp) => {
  const cached = inlined.get(url);
  if (cached) return cached;
  const result = (async () => {
    try {
      const isAsset = ASSET_PATH_PATTERN.test(url);
      const response = await fetch(new URL(url, window.location.origin), {
        mode: "cors",
        // Project assets are the user's own and need their session.
        credentials: isAsset ? "same-origin" : "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok || Number(response.headers.get("content-length")) > MAX_INLINED_BYTES) return null;
      const blob = await response.blob();
      // Rebuilt from a checked type, so the server's Content-Type cannot put
      // anything else into the data URL.
      const type = blob.type.split(";")[0].trim().toLowerCase();
      if (!accept.test(type)) return null;
      return blob.size > MAX_INLINED_BYTES ? null : await readAsDataUrl(new Blob([blob], { type }));
    } catch {
      return null;
    }
  })();
  inlined.set(url, result);
  void result.then((dataUrl) => keep(url, dataUrl));
  return result;
};

const IMAGE_TYPE = /^image\/[a-z0-9.+-]+$/;
const FONT_TYPE = /^(?:font\/[a-z0-9.+-]+|application\/(?:font-woff2?|x-font-woff|octet-stream))$/;

let iconFontCss: Promise<string | null> | null = null;

/**
 * The icon font's stylesheet with its font file inlined. The stylesheet is
 * checked against its integrity hash, the same as the copy the editor links.
 */
const loadIconFontCss = () =>
  (iconFontCss ??= (async () => {
    try {
      const response = await fetch(INERT_ICON_STYLESHEET.href, {
        integrity: INERT_ICON_STYLESHEET.integrity,
        mode: "cors",
        credentials: "omit",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const css = await response.text();
      const fontPath = css.match(/url\("?([^")]+\.woff2[^")]*)"?\)/)?.[1];
      if (!fontPath) return null;
      const font = await fetchDataUrl(new URL(fontPath, INERT_ICON_STYLESHEET.href).href, FONT_TYPE);
      return font ? css.replace(/src:[^;}]*/, `src:url("${font}") format("woff2")`) : null;
    } catch {
      return null;
    }
  })().then((css) => {
    if (css === null) iconFontCss = null;
    return css;
  }));

/**
 * Snapshots are drawn only in Chromium browsers, the ones they were measured
 * and checked in. Safari has drawn a <foreignObject> before its images load and
 * has refused to export the canvas, so Safari and Firefox keep every page as
 * DOM, which is what they always did. Only Chromium has `userAgentData`.
 */
const isChromium = () =>
  typeof navigator !== "undefined" &&
  Boolean(
    (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.some(
      ({ brand }) => brand === "Chromium",
    ),
  );

// Set at the first refusal to export a canvas too, after which no page tries again.
let isUnsupported = !isChromium();

/** Whether this browser takes snapshots at all. A page that cannot draws as DOM. */
export const canCaptureSnapshots = () => !isUnsupported;

/** Waits for the page's images and fonts, so the capture measures the page they lay out. */
export const settlePage = (root: ShadowRoot) =>
  Promise.race([
    Promise.all([
      document.fonts.ready,
      ...Array.from(root.querySelectorAll("img"), (image) => image.decode().catch(() => {})),
    ]),
    new Promise((resolve) => setTimeout(resolve, IMAGE_WAIT_MS)),
  ]);

/**
 * A JPEG of the page an inert frame shows, or null when part of it cannot be
 * drawn. `background` fills what the page leaves transparent, the way the
 * frame's own background shows through on the canvas.
 */
export const captureSnapshot = async ({
  root,
  width,
  height,
  background,
}: {
  root: ShadowRoot;
  width: number;
  height: number;
  background: string;
}): Promise<Blob | null> => {
  const frame = root.querySelector(`[${INERT_FRAME_ATTRIBUTE}]`);
  if (isUnsupported || !frame || width <= 0 || height <= 0) return null;
  let css = Array.from(root.querySelectorAll("style"), (style) => style.textContent ?? "").join("\n");
  if (root.querySelector(`link[href="${INERT_ICON_STYLESHEET.href}"]`)) {
    const iconCss = await loadIconFontCss();
    if (!iconCss) return null;
    css = iconCss + "\n" + css;
  }

  if (drawsDifferentlyAsImage(css, frame.outerHTML)) return null;
  const urls = collectImageUrls(frame, css);
  const fetched = await Promise.all(urls.map((url) => fetchDataUrl(url, IMAGE_TYPE)));
  if (fetched.includes(null)) return null;
  const dataUrls = new Map(urls.map((url, index) => [url, fetched[index] as string]));

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    buildSnapshotSvg({ css, markup: snapshotMarkup(frame, dataUrls), width, height, dataUrls }),
  )}`;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const scale = snapshotScale(height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  } catch {
    isUnsupported = true;
    return null;
  }
};

// One capture at a time, each when the browser is idle, so snapshotting a
// canvas of pages never stacks up into a long freeze.
let queue = Promise.resolve();
const whenIdle = () =>
  new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 2_000 });
    else setTimeout(resolve, 50);
  });

export const enqueueSnapshot = (task: () => Promise<void>) => {
  queue = queue.then(whenIdle).then(task).catch(() => {});
};
