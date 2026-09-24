/**
 * Renders stored page HTML to a PNG with headless Chromium.
 *
 * The preview it is meant to match runs allowlisted CDN scripts with
 * JavaScript enabled, so the renderer does the same. Not every write path
 * sanitizes before storing (the page PATCH route saves client HTML as sent),
 * so the renderer sanitizes again. That puts the preview's CSP, including
 * connect-src 'none', in front of any script, which keeps a stored page from
 * making this server fetch internal URLs and screenshot the answer. Local development drives a Chrome
 * installed on the machine; the deployment target is serverless Linux, where
 * `@sparticuz/chromium` ships a matching binary. Both are loaded lazily so no
 * other route ever pays for the dependency.
 */
import { accessSync, constants } from "node:fs";

import type { Browser } from "puppeteer-core";

import { PAGE_DEVICE_HEIGHTS, PAGE_DEVICE_WIDTHS } from "@/lib/canvasScene";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import type { VisualLintData } from "@/lib/mcp/diagnostics";

/** A failure the user can act on, as opposed to an internal bug. */
export class ScreenshotUnavailableError extends Error {}

const MACOS_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

const isExecutable = (path: string) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveLocalExecutablePath = (): string | null => {
  const configured = process.env.CHROME_PATH?.trim();
  if (configured) return configured;
  return MACOS_CHROME_PATHS.find(isExecutable) ?? null;
};

const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
];

const launchBrowser = async (): Promise<Browser> => {
  const puppeteer = await import("puppeteer-core");

  if (process.platform !== "linux") {
    const executablePath = resolveLocalExecutablePath();
    if (!executablePath) {
      throw new ScreenshotUnavailableError(
        "No Chromium is available for screenshots. Install Google Chrome, or set CHROME_PATH to its binary path.",
      );
    }
    return puppeteer.launch({ executablePath, headless: true, args: BROWSER_ARGS });
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: [...chromium.args, ...BROWSER_ARGS],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
};

/**
 * One browser per serverless instance, reused across warm invocations. Kept on
 * globalThis so Next's dev-mode module reloading does not spawn a copy per
 * render.
 */
const globalForBrowser = globalThis as typeof globalThis & {
  __wirelyBrowserPromise?: Promise<Browser> | null;
};

const getBrowser = (): Promise<Browser> => {
  if (!globalForBrowser.__wirelyBrowserPromise) {
    const launching = launchBrowser();
    globalForBrowser.__wirelyBrowserPromise = launching;
    // A rejected launch must not stay cached: the failure (no Chrome yet, a
    // transient OOM) would replay forever, and only a restart would clear it.
    void launching.catch(() => {
      globalForBrowser.__wirelyBrowserPromise = null;
    });
  }
  return globalForBrowser.__wirelyBrowserPromise;
};

const forgetBrowser = () => {
  globalForBrowser.__wirelyBrowserPromise = null;
};

const isBrowserGone = (error: unknown) => {
  const text = error instanceof Error ? error.message : String(error);
  return /closed|disconnected|crashed|session deleted/i.test(text);
};

/** Beyond this a full-page PNG is too large to ship in one tool response. */
const MAX_PNG_BYTES = 2_500_000;

export interface RenderedPng {
  base64: string;
  /** False when the page was too tall and only the viewport was captured. */
  fullPage: boolean;
  /** Raw layout measurements, present only when lint was requested. */
  lint?: VisualLintData;
}

/**
 * Runs inside the page, so it is serialized and must not reference anything
 * outside its own body. It only measures; `lib/mcp/diagnostics.ts` judges.
 */
const collectVisualLintData = (): VisualLintData => {
  const MAX_ELEMENTS = 4000;
  const MAX_CONTRAST = 300;
  const MAX_OVERFLOWING = 5;
  const MAX_CLIPPED = 10;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const colorCache = new Map<string, [number, number, number, number]>();
  // Computed colors may be oklch() or color() strings; painting them lets the
  // browser convert to sRGB bytes instead of parsing every color syntax here.
  const toBytes = (color: string): [number, number, number, number] => {
    const cached = colorCache.get(color);
    if (cached) return cached;
    let bytes: [number, number, number, number] = [0, 0, 0, 0];
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      // An unparseable color leaves fillStyle unchanged, so reset it first.
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      bytes = [r, g, b, a];
    }
    colorCache.set(color, bytes);
    return bytes;
  };

  const describe = (el: Element) => {
    const classes = Array.from(el.classList).slice(0, 2);
    const name = [el.tagName.toLowerCase(), ...classes].join(".");
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    return text ? `${name} "${text}"` : name;
  };

  const hasOwnText = (el: Element) =>
    Array.from(el.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
    );

  const viewportWidth = window.innerWidth;
  const overflowing: string[] = [];
  const clipped: string[] = [];
  const contrast: VisualLintData["contrast"] = [];

  const elements = Array.from(document.body?.querySelectorAll("*") ?? []).slice(0, MAX_ELEMENTS);
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (overflowing.length < MAX_OVERFLOWING && rect.right > viewportWidth + 1) {
      // Report the outermost offender; its children overflow only because it does.
      const parentRight = el.parentElement?.getBoundingClientRect().right ?? 0;
      if (parentRight <= viewportWidth + 1) overflowing.push(describe(el));
    }

    if (!hasOwnText(el)) continue;
    const style = getComputedStyle(el);

    const hides = (value: string) => value === "hidden" || value === "clip";
    // Ellipsis and line clamp are deliberate truncation, and a 1px box is the
    // sr-only pattern for screen reader text. Neither is a layout bug.
    const intentional =
      style.textOverflow === "ellipsis" ||
      (style.webkitLineClamp !== "" && style.webkitLineClamp !== "none") ||
      el.clientWidth <= 1 ||
      el.clientHeight <= 1;
    if (
      clipped.length < MAX_CLIPPED &&
      !intentional &&
      (hides(style.overflowX) || hides(style.overflowY)) &&
      (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    ) {
      clipped.push(describe(el));
    }

    if (
      contrast.length >= MAX_CONTRAST ||
      rect.width === 0 ||
      rect.height === 0 ||
      style.visibility !== "visible"
    ) {
      continue;
    }
    const layers: VisualLintData["contrast"][number]["layers"] = [];
    for (let node: Element | null = el; node; node = node.parentElement) {
      const layerStyle = node === el ? style : getComputedStyle(node);
      layers.push({
        color: toBytes(layerStyle.backgroundColor),
        hasImage: layerStyle.backgroundImage !== "none",
      });
    }
    contrast.push({
      label: describe(el),
      text: toBytes(style.color),
      layers,
      fontSizePx: parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || 400,
    });
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth,
    overflowing,
    clipped,
    contrast,
  };
};

const renderOnce = async (
  html: string,
  deviceType: "desktop" | "mobile",
  lint: boolean,
): Promise<RenderedPng> => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: PAGE_DEVICE_WIDTHS[deviceType],
      height: PAGE_DEVICE_HEIGHTS[deviceType],
      deviceScaleFactor: 1,
    });

    await page.setContent(sanitizeIframeHtml(html), { waitUntil: "load", timeout: 20_000 });
    // Give allowlisted CDN scripts and Unsplash images a moment to land. A slow
    // one degrades the screenshot instead of failing the tool call.
    await page
      .waitForNetworkIdle({ idleTime: 400, timeout: 5_000 })
      .catch(() => undefined);
    await page
      .evaluate(() => document.fonts.ready.then(() => undefined))
      .catch(() => undefined);

    let png = await page.screenshot({ type: "png", fullPage: true });
    let fullPage = true;
    if (png.byteLength > MAX_PNG_BYTES) {
      png = await page.screenshot({ type: "png", fullPage: false });
      fullPage = false;
    }
    const lintData = lint ? await page.evaluate(collectVisualLintData) : undefined;
    return { base64: Buffer.from(png).toString("base64"), fullPage, lint: lintData };
  } finally {
    await page.close().catch(() => undefined);
  }
};

/**
 * Screenshots the page HTML at its device's frame size. Retries once on a
 * browser that died between invocations, which is the one failure a cold
 * serverless instance regularly produces.
 */
export const renderPagePng = async (
  html: string,
  deviceType: "desktop" | "mobile",
  lint = false,
): Promise<RenderedPng> => {
  try {
    return await renderOnce(html, deviceType, lint);
  } catch (error) {
    if (!isBrowserGone(error)) throw error;
    forgetBrowser();
    return renderOnce(html, deviceType, lint);
  }
};
