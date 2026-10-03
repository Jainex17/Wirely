/**
 * Still images of canvas pages. A still preview iframe is a whole document the
 * browser rasterizes again on every zoom step, so a zoomed out canvas with
 * dozens of them stutters. A snapshot is one small bitmap the GPU only scales.
 *
 * The page HTML is hostile. It is parsed with DOMParser, which runs no script
 * and loads nothing, and drawn as an SVG image, which also runs no script and
 * loads nothing. The editor fetches the page's images and fonts itself, only
 * from hosts the frame's CSP already allows, and inlines them as data URLs.
 * Nothing from the page is ever inserted into the editor's DOM.
 */
import { ASSET_PATH_PATTERN } from "@/lib/assetPaths";
import { UNSPLASH_IMAGE_HOSTS } from "@/lib/stockImages";

// Pixels across a snapshot. A desktop page draws at a third of its size,
// which stays sharp until the zoom is high enough for the page to go live.
const SNAPSHOT_TARGET_WIDTH = 480;
const UNSPLASH_SNAPSHOT_WIDTH = 640;
const MAX_INLINED_BYTES = 2 * 1024 * 1024;
const CACHE_LIMIT = 60;
const INLINED_LIMIT = 200;

export const snapshotScale = (width: number) => Math.min(1, SNAPSHOT_TARGET_WIDTH / width);

type UrlKind = "image" | "font";

/**
 * The URL the editor fetches for one reference in the page, or null to leave
 * it unloaded. Images come from Unsplash, asked for at thumbnail size, or
 * from the project's own assets. Fonts come from any https host, matching
 * the frame's `font-src https:`.
 */
export const resolveSnapshotUrl = (raw: string, base: string, kind: UrlKind) => {
  let url: URL;
  try {
    url = new URL(raw.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.origin !== new URL(base).origin) return null;
  if (kind === "font") return url.protocol === "https:" ? url.href : null;
  if (url.origin === new URL(base).origin) {
    return ASSET_PATH_PATTERN.test(url.pathname) ? url.href : null;
  }
  if (!(UNSPLASH_IMAGE_HOSTS as readonly string[]).includes(url.hostname)) return null;
  const width = Number(url.searchParams.get("w"));
  if (!width || width > UNSPLASH_SNAPSHOT_WIDTH) {
    const height = Number(url.searchParams.get("h"));
    if (width && height) {
      url.searchParams.set("h", String(Math.round((height * UNSPLASH_SNAPSHOT_WIDTH) / width)));
    }
    url.searchParams.set("w", String(UNSPLASH_SNAPSHOT_WIDTH));
  }
  return url.href;
};

const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
const FONT_FACE_PATTERN = /@font-face\s*\{[^}]*\}/gi;

/**
 * Drops `@font-face` rules for scripts other than Latin, so a font CDN
 * stylesheet does not make the editor download every subset of the font.
 */
export const keepLatinFontFaces = (css: string) =>
  css.replace(FONT_FACE_PATTERN, (rule) => {
    const range = rule.match(/unicode-range\s*:([^;}]*)/i)?.[1];
    return !range || /U\+0000-00FF/i.test(range) ? rule : "";
  });

/** Every url() in a stylesheet, marked font inside `@font-face` and image elsewhere. */
export const collectCssUrls = (css: string) => {
  const fontRanges = [...css.matchAll(FONT_FACE_PATTERN)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  return [...css.matchAll(CSS_URL_PATTERN)].map((match) => ({
    raw: match[2],
    kind: (fontRanges.some(([start, end]) => match.index >= start && match.index < end)
      ? "font"
      : "image") as UrlKind,
  }));
};

export const rewriteCssUrls = (css: string, replacements: ReadonlyMap<string, string>) =>
  css.replace(CSS_URL_PATTERN, (whole, _quote: string, raw: string) => {
    const replacement = replacements.get(raw);
    return replacement ? `url("${replacement}")` : whole;
  });

export const buildSnapshotSvg = (xhtml: string, width: number, height: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;

const inlined = new Map<string, Promise<string | null>>();

const fetchAsDataUrl = (url: string) => {
  let result = inlined.get(url);
  if (!result) {
    result = fetch(url, { referrerPolicy: "no-referrer" })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) =>
        blob && blob.size <= MAX_INLINED_BYTES
          ? new Promise<string | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            })
          : null,
      )
      .catch(() => null);
    inlined.set(url, result);
    if (inlined.size > INLINED_LIMIT) inlined.delete(inlined.keys().next().value ?? "");
  }
  return result;
};

const fetchStylesheet = (url: string) =>
  fetch(url, { referrerPolicy: "no-referrer" })
    .then((response) => (response.ok ? response.text() : ""))
    .catch(() => "");

// Resolves every url() in a stylesheet to a data URL where the CSP allows it.
const inlineCss = async (css: string, base: string) => {
  const replacements = new Map<string, string>();
  await Promise.all(
    collectCssUrls(css).map(async ({ raw, kind }) => {
      const url = resolveSnapshotUrl(raw, base, kind);
      const dataUrl = url ? await fetchAsDataUrl(url) : null;
      if (dataUrl) replacements.set(raw, dataUrl);
    }),
  );
  return rewriteCssUrls(css, replacements);
};

const isFontCdnStylesheet = (href: string) => {
  try {
    return new URL(href).hostname === "cdn.jsdelivr.net";
  } catch {
    return false;
  }
};

// The page as self-contained XHTML, the only markup an SVG image renders.
const buildSnapshotXhtml = async (html: string) => {
  const base = window.location.href;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, noscript, meta, base, source").forEach((node) => node.remove());

  await Promise.all([
    ...[...doc.querySelectorAll<HTMLLinkElement>("link")].map(async (link) => {
      const href = link.getAttribute("href") ?? "";
      if (!/\bstylesheet\b/i.test(link.rel) || !isFontCdnStylesheet(href)) {
        link.remove();
        return;
      }
      const style = doc.createElement("style");
      style.textContent = await inlineCss(keepLatinFontFaces(await fetchStylesheet(href)), href);
      link.replaceWith(style);
    }),
    ...[...doc.querySelectorAll("style")].map(async (style) => {
      style.textContent = await inlineCss(style.textContent ?? "", base);
    }),
    ...[...doc.querySelectorAll<HTMLElement>("[style]")].map(async (element) => {
      element.setAttribute("style", await inlineCss(element.getAttribute("style") ?? "", base));
    }),
    ...[...doc.querySelectorAll("img")].map(async (image) => {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.removeAttribute("loading");
      const url = resolveSnapshotUrl(image.getAttribute("src") ?? "", base, "image");
      const dataUrl = url ? await fetchAsDataUrl(url) : null;
      if (dataUrl) image.setAttribute("src", dataUrl);
      else if (!image.getAttribute("src")?.startsWith("data:")) image.removeAttribute("src");
    }),
  ]);

  return new XMLSerializer().serializeToString(doc.documentElement);
};

const rasterize = async (html: string, width: number, height: number) => {
  const svg = buildSnapshotSvg(await buildSnapshotXhtml(html), width, height);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const scale = snapshotScale(width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Throws where the browser taints a canvas drawn from an SVG with
  // foreignObject, as Safari does. The caller keeps the iframe preview there.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.85),
  );
  return blob ? URL.createObjectURL(blob) : null;
};

// Captures run one at a time when the browser is idle, so a canvas opening
// with forty pages never stalls on drawing them all at once.
const queue: Array<() => Promise<void>> = [];
let isDraining = false;
const waitForIdle = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => resolve(), { timeout: 500 });
    } else {
      window.setTimeout(resolve, 0);
    }
  });

const drain = async () => {
  if (isDraining) return;
  isDraining = true;
  while (queue.length > 0) {
    await waitForIdle();
    await queue.shift()?.();
  }
  isDraining = false;
};

const snapshots = new Map<string, Promise<string | null>>();

/**
 * Resolves to an object URL for a still image of a compiled, motion-frozen
 * page drawn at `width` by `height`, or to null where the browser cannot
 * capture it. The same page at the same size resolves to the same URL.
 */
export const captureFrameSnapshot = (html: string, width: number, height: number) => {
  const key = `${width}x${height}:${html}`;
  let result = snapshots.get(key);
  if (result) return result;
  result = new Promise<string | null>((resolve) => {
    queue.push(() =>
      rasterize(html, width, height)
        .catch(() => null)
        .then(resolve),
    );
  });
  snapshots.set(key, result);
  if (snapshots.size > CACHE_LIMIT) {
    const [oldestKey, oldest] = snapshots.entries().next().value ?? [];
    if (oldestKey !== undefined) snapshots.delete(oldestKey);
    void oldest?.then((url) => url && URL.revokeObjectURL(url));
  }
  void drain();
  return result;
};
