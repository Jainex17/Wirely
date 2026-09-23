/**
 * Renders stored page HTML to a PNG with headless Chromium.
 *
 * The document was already sanitized on its way into the database, and the
 * preview it is meant to match runs allowlisted CDN scripts with JavaScript
 * enabled, so the renderer does the same. Local development drives a Chrome
 * installed on the machine; the deployment target is serverless Linux, where
 * `@sparticuz/chromium` ships a matching binary. Both are loaded lazily so no
 * other route ever pays for the dependency.
 */
import { accessSync, constants } from "node:fs";

import type { Browser } from "puppeteer-core";

import { PAGE_DEVICE_HEIGHTS, PAGE_DEVICE_WIDTHS } from "@/lib/canvasScene";

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
}

const renderOnce = async (
  html: string,
  deviceType: "desktop" | "mobile",
): Promise<RenderedPng> => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: PAGE_DEVICE_WIDTHS[deviceType],
      height: PAGE_DEVICE_HEIGHTS[deviceType],
      deviceScaleFactor: 1,
    });

    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
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
    return { base64: Buffer.from(png).toString("base64"), fullPage };
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
): Promise<RenderedPng> => {
  try {
    return await renderOnce(html, deviceType);
  } catch (error) {
    if (!isBrowserGone(error)) throw error;
    forgetBrowser();
    return renderOnce(html, deviceType);
  }
};
