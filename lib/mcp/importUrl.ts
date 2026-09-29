/**
 * Turns a live web page into one self-contained Wirely page, so a user can
 * redesign their real site instead of starting from a blank frame.
 *
 * Headless Chromium loads the URL, and a serializer inside the page folds
 * every stylesheet into one <style> with unused rules dropped, rewrites the
 * form controls the sanitizer would delete into styled <div>s, and inlines
 * small images as data URIs. Scripts are not kept; the result is a static
 * snapshot of what rendered. The caller still runs `sanitizeIframeHtml`.
 *
 * The browser runs on this server, so every request it makes, including
 * redirects and subresources, is checked against the same private address
 * rules as `lib/urlContext.ts`.
 */
import { lookup } from "node:dns/promises";

import type { HTTPRequest } from "puppeteer-core";

import { getPageFrameSize } from "@/lib/canvasScene";
import { forgetBrowser, getBrowser, isBrowserGone } from "@/lib/mcp/screenshot";
import { isBlockedIpAddress, isBlockedUrlHost } from "@/lib/urlContext";

/** A failure the agent can act on, such as a blocked or unreachable URL. */
export class ImportUrlError extends Error {}

const MAX_CSS_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 60_000;
const MAX_INLINED_IMAGE_BYTES = 250_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const parseImportUrl = (rawUrl: string) => {
  try {
    const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    if ((url.protocol === "http:" || url.protocol === "https:") && !isBlockedUrlHost(url.hostname)) {
      return url;
    }
  } catch {
    // Falls through to null.
  }
  return null;
};

/** Resolves each host once per import and refuses any that points into a private range. */
const createHostGuard = () => {
  const verdicts = new Map<string, Promise<boolean>>();
  return (hostname: string) => {
    let verdict = verdicts.get(hostname);
    if (!verdict) {
      verdict = isBlockedUrlHost(hostname)
        ? Promise.resolve(false)
        : lookup(hostname, { all: true, verbatim: true }).then(
            (entries) => entries.length > 0 && !entries.some((entry) => isBlockedIpAddress(entry.address)),
            () => false,
          );
      verdicts.set(hostname, verdict);
    }
    return verdict;
  };
};

/**
 * Runs inside the page, so it is serialized and must not reference anything
 * outside its own body.
 */
const serializePage = (
  sheets: Record<string, string>,
  images: Record<string, string>,
  maxChars: number,
) => {
  const absolute = (value: string, base: string) => {
    try {
      return new URL(value, base).href;
    } catch {
      return value;
    }
  };
  const rewriteUrls = (css: string, base: string) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, _quote, value: string) =>
      value.startsWith("data:") ? match : `url("${absolute(value.trim(), base)}")`,
    );

  // Linked sheets are cross-origin, so their rules are unreadable until the
  // captured text replaces each link with an inline <style>.
  for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'))) {
    const text = sheets[link.href];
    if (text === undefined) {
      link.remove();
      continue;
    }
    const style = document.createElement("style");
    if (link.media) style.media = link.media;
    style.textContent = rewriteUrls(text, link.href);
    link.replaceWith(style);
  }

  // A rule whose selector matches nothing on the page is dead weight. Pseudo
  // classes are stripped before testing, so hover and focus styles survive.
  const matchesSomething = (selectorText: string) => {
    const stripped = selectorText.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, "");
    if (!stripped.replace(/[\s,>+~*]/g, "")) return true;
    try {
      return document.querySelector(stripped) !== null;
    } catch {
      return true;
    }
  };
  // Keyframes are held back until the rest of the CSS is known, then kept
  // only when something still names them. Sites ship hundreds unused.
  const keyframes: CSSKeyframesRule[] = [];
  const keepRules = (rules: CSSRuleList): string =>
    Array.from(rules)
      .map((rule) => {
        if (rule instanceof CSSStyleRule) {
          return matchesSomething(rule.selectorText) ? rule.cssText : "";
        }
        if (rule instanceof CSSImportRule) return "";
        if (rule instanceof CSSKeyframesRule) {
          keyframes.push(rule);
          return "";
        }
        if ("cssRules" in rule) {
          const inner = keepRules((rule as CSSGroupingRule).cssRules);
          if (!inner) return "";
          const prelude = rule.cssText.slice(0, rule.cssText.indexOf("{"));
          return `${prelude}{${inner}}`;
        }
        return rule.cssText;
      })
      .filter(Boolean)
      .join("\n");

  const cssParts: string[] = [];
  for (const sheet of [...Array.from(document.styleSheets), ...document.adoptedStyleSheets]) {
    try {
      const text = keepRules(sheet.cssRules);
      if (!text) continue;
      const media = sheet.media?.mediaText;
      cssParts.push(media && media !== "all" ? `@media ${media}{${text}}` : text);
    } catch {
      // A sheet that is still unreadable is skipped.
    }
  }
  const referencing = cssParts.join("\n") + (document.body?.innerHTML ?? "");
  const usedKeyframes = new Set(
    keyframes.filter((rule) => referencing.includes(rule.name)).map((rule) => rule.cssText),
  );
  const css = rewriteUrls([...cssParts, ...usedKeyframes].join("\n"), location.href);

  // The sanitizer deletes these tags with their contents, which would take a
  // site's nav buttons and search bars with them. Each becomes a <div> that
  // keeps its classes and carries its rendered box inline.
  const COPIED_PROPERTIES = [
    "display", "box-sizing", "width", "height", "min-width", "padding", "margin", "border",
    "border-radius", "background-color", "background-image", "color", "font-family",
    "font-size", "font-weight", "line-height", "letter-spacing", "text-align",
    "text-transform", "align-items", "justify-content", "gap", "flex-direction",
    "box-shadow", "opacity", "cursor", "white-space",
  ];
  const controls = Array.from(
    document.body.querySelectorAll<HTMLElement>("button, input, select, textarea, form, iframe, video, canvas, object, embed"),
  ).map((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      element,
      style: COPIED_PROPERTIES.map((name) => `${name}:${computed.getPropertyValue(name)}`).join(";"),
      size: `width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px`,
    };
  });
  for (const { element, style, size } of controls) {
    if (!element.isConnected) continue;
    const tag = element.tagName.toLowerCase();
    const replacement = document.createElement("div");
    for (const attribute of ["class", "id", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (value) replacement.setAttribute(attribute, value);
    }
    if (tag === "form") {
      replacement.append(...Array.from(element.childNodes));
    } else if (tag === "button") {
      replacement.setAttribute("role", "button");
      replacement.setAttribute("style", style);
      replacement.append(...Array.from(element.childNodes));
    } else if (tag === "input" || tag === "textarea") {
      const field = element as HTMLInputElement;
      if (field.type === "hidden") {
        element.remove();
        continue;
      }
      replacement.setAttribute("style", `${style};${size}`);
      replacement.textContent = field.value || field.placeholder || "";
    } else if (tag === "select") {
      const select = element as HTMLSelectElement;
      replacement.setAttribute("style", `${style};${size}`);
      replacement.textContent = select.selectedOptions[0]?.textContent ?? "";
    } else if (tag === "canvas") {
      // Canvases are mostly animated backgrounds, which a gray box would cover.
      replacement.setAttribute("style", size);
    } else {
      replacement.setAttribute("style", `${size};background:#e5e7eb;border-radius:8px`);
    }
    element.replaceWith(replacement);
  }

  const grayBox = (width: number, height: number) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(width))}" height="${Math.max(1, Math.round(height))}"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>`,
    );

  for (const image of Array.from(document.images)) {
    const data = images[image.currentSrc || image.src];
    image.removeAttribute("srcset");
    image.removeAttribute("loading");
    if (data) {
      image.src = data;
    } else {
      // Only Unsplash and data: images survive the sanitizer, so anything
      // else becomes a sized gray box instead of a hole in the layout.
      const rect = image.getBoundingClientRect();
      image.src = grayBox(rect.width, rect.height);
    }
  }
  for (const source of Array.from(document.querySelectorAll("picture source"))) source.remove();

  for (const element of Array.from(
    document.querySelectorAll('script, noscript, style, link, meta:not([charset]):not([name="viewport"]), template'),
  )) {
    element.remove();
  }
  // Over the page size cap, the heaviest artwork goes first: inline SVG
  // illustrations and inlined images become gray boxes of the same size.
  let size = document.documentElement.outerHTML.length + css.length;
  if (size > maxChars) {
    const heavy = [
      ...Array.from(document.querySelectorAll<SVGSVGElement>("svg:not(svg svg)")).map((element) => ({
        element: element as Element,
        weight: element.outerHTML.length,
      })),
      ...Array.from(document.images).map((element) => ({
        element: element as Element,
        weight: element.src.length,
      })),
    ].sort((a, b) => b.weight - a.weight);
    for (const { element, weight } of heavy) {
      if (size <= maxChars) break;
      const rect = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const box = document.createElement("img");
      box.src = grayBox(rect.width, rect.height);
      // Large artwork is often an absolutely placed backdrop. The box keeps
      // its place in the stack so it stays behind the text it sat behind.
      const placement = ["position", "top", "right", "bottom", "left", "z-index", "transform", "opacity"]
        .map((name) => `${name}:${computed.getPropertyValue(name)}`)
        .join(";");
      box.setAttribute(
        "style",
        `${placement};width:${Math.round(rect.width)}px;height:${Math.round(rect.height)}px`,
      );
      const className = element.getAttribute("class");
      if (className) box.setAttribute("class", className);
      element.replaceWith(box);
      size -= weight - box.outerHTML.length;
    }
  }

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  return `<!doctype html>\n${document.documentElement.outerHTML}`;
};

const importOnce = async (url: URL, deviceType: "desktop" | "mobile", maxChars: number) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const isAllowedHost = createHostGuard();
  const sheets: Record<string, string> = {};
  const images: Record<string, string> = {};
  const pendingBodies: Promise<void>[] = [];
  let cssBytes = 0;
  let imageBytes = 0;

  try {
    await page.setUserAgent({ userAgent: USER_AGENT });
    await page.setViewport({ ...getPageFrameSize({ deviceType }, "desktop"), deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", (request: HTTPRequest) => {
      const target = request.url();
      if (target.startsWith("data:") || target.startsWith("blob:")) {
        void request.continue();
        return;
      }
      const type = request.resourceType();
      if (type === "media" || type === "websocket" || type === "eventsource") {
        void request.abort();
        return;
      }
      let hostname = "";
      try {
        const parsed = new URL(target);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") hostname = parsed.hostname;
      } catch {
        // An unparseable URL is aborted below.
      }
      if (!hostname) {
        void request.abort();
        return;
      }
      void isAllowedHost(hostname).then((allowed) =>
        allowed ? request.continue() : request.abort("blockedbyclient"),
      );
    });
    page.on("response", (response) => {
      const type = response.request().resourceType();
      if (!response.ok() || (type !== "stylesheet" && type !== "image")) return;
      pendingBodies.push(
        response
          .buffer()
          .then((body) => {
            if (type === "stylesheet" && cssBytes + body.byteLength <= MAX_CSS_BYTES) {
              cssBytes += body.byteLength;
              sheets[response.url()] = body.toString("utf8");
            } else if (
              type === "image" &&
              body.byteLength <= MAX_IMAGE_BYTES &&
              imageBytes + body.byteLength <= MAX_INLINED_IMAGE_BYTES
            ) {
              const mime = response.headers()["content-type"]?.split(";")[0] ?? "";
              if (!mime.startsWith("image/")) return;
              imageBytes += body.byteLength;
              images[response.url()] = `data:${mime};base64,${body.toString("base64")}`;
            }
          })
          .catch(() => undefined),
      );
    });

    const response = await page
      .goto(url.toString(), { waitUntil: "load", timeout: 20_000 })
      .catch((error: unknown) => {
        if (isBrowserGone(error)) throw error;
        throw new ImportUrlError(`Could not load ${url.hostname}. Check the URL is public and reachable.`);
      });
    if (!response || !response.ok()) {
      throw new ImportUrlError(
        `${url.hostname} answered with status ${response?.status() ?? "unknown"}. Check the URL.`,
      );
    }
    // Client-rendered sites paint after load. A slow one imports as far as it got.
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 6_000 }).catch(() => undefined);
    await Promise.all(pendingBodies);

    const html = await page.evaluate(serializePage, sheets, images, maxChars);
    return { html, title: await page.title() };
  } finally {
    await page.close().catch(() => undefined);
  }
};

/**
 * Loads `rawUrl` at the device's frame width and returns the page as one
 * static HTML document, not yet sanitized, and its document title.
 */
export const importUrlHtml = async (
  rawUrl: string,
  deviceType: "desktop" | "mobile",
  /** Artwork is swapped for gray boxes until the document fits this size. */
  maxChars: number,
) => {
  const url = parseImportUrl(rawUrl.trim());
  if (!url) throw new ImportUrlError("Only public http and https URLs can be imported.");
  try {
    return await importOnce(url, deviceType, maxChars);
  } catch (error) {
    if (!isBrowserGone(error)) throw error;
    forgetBrowser();
    return importOnce(url, deviceType, maxChars);
  }
};
