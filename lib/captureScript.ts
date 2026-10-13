/**
 * The script an agent runs on the user's machine to bring a page of their
 * running app onto the canvas, served from `/api/capture/script`.
 *
 * Wirely's server cannot reach the user's localhost, and their app may need
 * their cookies, so the capture happens where the app runs. The script starts
 * the user's own Chrome headless on a throwaway profile, drives it over the
 * DevTools protocol with Node's built-in WebSocket, and so needs no npm
 * install. It measures the page with the same `collectStyleMap` the server
 * runs on the design, takes a screenshot, folds the page into one static
 * document with the same `serializePage` that `import_url` uses, inlines the
 * local fonts the preview's CSP would block, and uploads all of it to a
 * signed capture link. The server's answer, a build check report when a
 * design page was named, goes to stdout for the agent to read.
 *
 * The template is plain JavaScript inside String.raw, so it must not contain
 * backticks or dollar-brace sequences. The two page functions are injected
 * as source text, which is why both are self-contained.
 */
import { collectStyleMap } from "@/lib/buildCheck";
import { PAGE_DEVICE_HEIGHTS, PAGE_DEVICE_WIDTHS } from "@/lib/canvasScene";
import { MAX_IMAGE_BYTES, MAX_INLINED_IMAGE_BYTES, serializePage } from "@/lib/mcp/importUrl";
/** Characters of base64 font data a capture may add to the page. */
const MAX_FONT_CHARS = 200_000;

const TEMPLATE = String.raw`#!/usr/bin/env node
// Wirely local capture. Brings one page of an app running on this machine onto
// a Wirely canvas, and checks it against a design page when --compare is given.
// Usage: node wirely-capture.mjs --url <page url> --upload <signed link>
//   [--device desktop|mobile] [--page <page id to update>] [--compare <design page id>]
//   [--cookie "name=value; other=value"] [--wait <extra ms after load>]
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { delimiter, join } from "node:path";

const serializePage = __SERIALIZE_PAGE__;
const collectStyleMap = __COLLECT_STYLE_MAP__;
const DEVICE_SIZES = __DEVICE_SIZES__;
const MAX_HTML_CHARS = __MAX_HTML_CHARS__;
const MAX_SHOT_HEIGHT = __MAX_SHOT_HEIGHT__;
const MAX_UPLOAD_BYTES = __MAX_UPLOAD_BYTES__;
const MAX_IMAGE_BYTES = __MAX_IMAGE_BYTES__;
const MAX_INLINED_IMAGE_BYTES = __MAX_INLINED_IMAGE_BYTES__;
const MAX_FONT_CHARS = __MAX_FONT_CHARS__;

const fail = (message) => {
  console.error("wirely-capture: " + message);
  process.exit(1);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const options = { device: "desktop", cookies: [], wait: 0 };
  const names = { "--url": "url", "--upload": "upload", "--device": "device", "--page": "page",
    "--compare": "compare", "--wait": "wait" };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) fail("missing a value after " + flag);
    if (flag === "--cookie") options.cookies.push(value);
    else if (names[flag]) options[names[flag]] = value;
    else fail("unknown option " + flag);
  }
  if (!options.url || !options.upload) fail("--url and --upload are required.");
  if (!DEVICE_SIZES[options.device]) fail("--device must be desktop or mobile.");
  options.wait = Math.min(Number(options.wait) || 0, 30000);
  return options;
};

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const runnable = (path) => {
    try {
      if (process.platform === "win32") return existsSync(path);
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  let candidates = [];
  if (process.platform === "darwin") {
    const apps = ["Google Chrome.app/Contents/MacOS/Google Chrome", "Chromium.app/Contents/MacOS/Chromium",
      "Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "Brave Browser.app/Contents/MacOS/Brave Browser"];
    candidates = apps.flatMap((app) => ["/Applications/" + app, join(homedir(), "Applications", app)]);
  } else if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    candidates = roots.flatMap((root) => [join(root, "Google", "Chrome", "Application", "chrome.exe"),
      join(root, "Microsoft", "Edge", "Application", "msedge.exe")]);
  } else {
    const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"];
    candidates = (process.env.PATH || "").split(delimiter).flatMap((dir) => names.map((name) => join(dir, name)));
  }
  return candidates.find(runnable) || null;
};

const launchChrome = (path, profile) =>
  new Promise((resolve, reject) => {
    const chrome = spawn(path, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile,
      "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio",
      "--disable-extensions", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start within 20 seconds.")), 20000);
    chrome.stderr.on("data", (chunk) => {
      output += chunk;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve({ chrome, browserUrl: match[1] });
      }
    });
    chrome.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    chrome.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Chrome exited with code " + code + " before it was ready."));
    });
  });

const connect = (url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const listeners = new Map();
    let nextId = 0;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (!call) return;
        if (message.error) call.reject(new Error(message.error.message));
        else call.resolve(message.result);
      } else {
        for (const listener of listeners.get(message.method) || []) listener(message.params);
      }
    };
    socket.onerror = () => reject(new Error("Could not connect to Chrome's DevTools."));
    socket.onopen = () =>
      resolve({
        send: (method, params) =>
          new Promise((done, failed) => {
            nextId += 1;
            pending.set(nextId, { resolve: done, reject: failed });
            socket.send(JSON.stringify({ id: nextId, method, params: params || {} }));
          }),
        on: (method, listener) => listeners.set(method, [...(listeners.get(method) || []), listener]),
        close: () => socket.close(),
      });
  });

const evaluate = async (cdp, expression) => {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    const exception = result.exceptionDetails.exception;
    throw new Error((exception && exception.description) || result.exceptionDetails.text);
  }
  return result.result.value;
};

// Runs in the page. Scrolls to the bottom and back so lazy images and
// scroll-triggered content render before anything is measured.
const scrollThrough = async () => {
  for (let step = 0; step < 40; step += 1) {
    const before = window.scrollY;
    window.scrollBy(0, window.innerHeight);
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (window.scrollY === before) break;
  }
  window.scrollTo(0, 0);
  await new Promise((resolve) => setTimeout(resolve, 300));
};

// Runs in the page after the screenshot. Collects the stylesheets and small
// images the serializer inlines, then swaps local font files, which the
// preview's CSP blocks, for data URLs. Latin subsets go first, since a
// budget that runs out should drop Cyrillic before it drops the body text.
const capturePage = async (serialize, limits) => {
  const toDataUrl = (blob) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  const sheets = {};
  for (const link of Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))) {
    try {
      const response = await fetch(link.href);
      if (response.ok) sheets[link.href] = await response.text();
    } catch {
      // An unreadable sheet is dropped, as import_url drops it.
    }
  }
  const images = {};
  let imageBytes = 0;
  for (const image of Array.from(document.images)) {
    const src = image.currentSrc || image.src;
    if (!src || src.startsWith("data:") || images[src]) continue;
    try {
      const blob = await (await fetch(src)).blob();
      if (!blob.type.startsWith("image/") || blob.size > limits.maxImageBytes) continue;
      if (imageBytes + blob.size > limits.maxInlinedImageBytes) continue;
      const data = await toDataUrl(blob);
      if (data) {
        images[src] = data;
        imageBytes += blob.size;
      }
    } catch {
      // A cross-origin image without CORS becomes a gray box.
    }
  }

  let html = serialize(sheets, images, limits.maxHtmlChars - limits.maxFontChars);

  const fontUrl = /url\(\s*["']?(http:\/\/[^"')]+?\.(?:woff2?|ttf|otf)(?:\?[^"')]*)?)["']?\s*\)/gi;
  const ordered = [];
  for (const block of html.match(/@font-face\s*\{[^}]*\}/gi) || []) {
    const latin = !/unicode-range/i.test(block) || /U\+0+-0*FF\b/i.test(block);
    for (const match of block.matchAll(fontUrl)) ordered.push({ url: match[1], latin });
  }
  ordered.sort((a, b) => Number(b.latin) - Number(a.latin));
  let fontChars = 0;
  const fonts = new Map();
  for (const { url } of ordered) {
    if (fonts.has(url)) continue;
    try {
      const blob = await (await fetch(url)).blob();
      const data = await toDataUrl(blob);
      if (!data || fontChars + data.length > limits.maxFontChars) continue;
      fonts.set(url, data);
      fontChars += data.length;
    } catch {
      // The font falls back to the next family in the stack.
    }
  }
  html = html.replace(fontUrl, (match, url) => (fonts.has(url) ? 'url("' + fonts.get(url) + '")' : match));
  return { html, title: document.title };
};

const main = async () => {
  if (typeof WebSocket === "undefined" || typeof FormData === "undefined") {
    fail("this script needs Node 22 or newer, or Bun. Run it with bun, or upgrade Node.");
  }
  const options = parseArgs(process.argv.slice(2));
  const chromePath = findChrome();
  if (!chromePath) fail("no Chrome, Chromium, Edge, or Brave found. Set CHROME_PATH to the browser binary.");

  const profile = mkdtempSync(join(tmpdir(), "wirely-capture-"));
  let chrome = null;
  let cdp = null;
  try {
    const launched = await launchChrome(chromePath, profile);
    chrome = launched.chrome;
    const port = new URL(launched.browserUrl).port;
    const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new Error("Chrome opened no page to drive.");
    cdp = await connect(target.webSocketDebuggerUrl);

    const [width, height] = DEVICE_SIZES[options.device];
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: options.device === "mobile",
    });
    // The server renders the design in light mode, so the build is measured in it too.
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    for (const header of options.cookies) {
      for (const pair of header.split(";")) {
        const at = pair.indexOf("=");
        if (at <= 0) continue;
        await cdp.send("Network.setCookie", {
          name: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim(), url: options.url,
        });
      }
    }

    let inflight = 0;
    let lastActivity = Date.now();
    let documentStatus = 0;
    cdp.on("Network.requestWillBeSent", () => { inflight += 1; lastActivity = Date.now(); });
    const settle = () => { inflight = Math.max(0, inflight - 1); lastActivity = Date.now(); };
    cdp.on("Network.loadingFinished", settle);
    cdp.on("Network.loadingFailed", settle);
    cdp.on("Network.responseReceived", (event) => {
      if (event.type === "Document" && !documentStatus) documentStatus = event.response.status;
    });
    const waitForIdle = async (maxMs) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        if (inflight === 0 && Date.now() - lastActivity > 500) return;
        await sleep(100);
      }
    };

    const loaded = new Promise((resolve) => cdp.on("Page.loadEventFired", resolve));
    const navigation = await cdp.send("Page.navigate", { url: options.url });
    if (navigation.errorText) {
      throw new Error("could not open " + options.url + " (" + navigation.errorText + "). Is the app running?");
    }
    await Promise.race([loaded, sleep(30000)]);
    if (documentStatus >= 400) {
      throw new Error(options.url + " answered with status " + documentStatus + ".");
    }
    await waitForIdle(10000);
    await evaluate(cdp, "(" + scrollThrough + ")()");
    await waitForIdle(5000);
    if (options.wait) await sleep(options.wait);
    await evaluate(cdp, "document.fonts.ready.then(() => true)");

    const finalUrl = await evaluate(cdp, "location.href");
    const styleMap = await evaluate(cdp, "(" + collectStyleMap + ")()");
    const shotHeight = Math.max(1, Math.min(Math.ceil(styleMap.height), MAX_SHOT_HEIGHT));
    const styleMapJson = JSON.stringify(styleMap);
    // Screenshots come before capturePage, which rewrites the live page: it
    // turns controls into divs and large images into gray boxes. Lower
    // qualities are taken only while a shot could crowd out the largest page.
    const shots = [];
    for (const quality of [80, 55, 35]) {
      const result = await cdp.send("Page.captureScreenshot", {
        format: "jpeg", quality, captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: shotHeight, scale: 1 },
      });
      shots.push(Buffer.from(result.data, "base64"));
      if (shots.at(-1).byteLength <= MAX_UPLOAD_BYTES - MAX_HTML_CHARS * 2 - Buffer.byteLength(styleMapJson)) break;
    }
    const captured = await evaluate(
      cdp,
      "(" + capturePage + ")(" + serializePage + ", " + JSON.stringify({
        maxHtmlChars: MAX_HTML_CHARS, maxFontChars: MAX_FONT_CHARS,
        maxImageBytes: MAX_IMAGE_BYTES, maxInlinedImageBytes: MAX_INLINED_IMAGE_BYTES,
      }) + ")",
    );

    const meta = JSON.stringify({
      url: options.url, finalUrl, title: captured.title, deviceType: options.device,
      pageId: options.page || null, comparePageId: options.compare || null,
    });
    const room = MAX_UPLOAD_BYTES - Buffer.byteLength(captured.html) - Buffer.byteLength(styleMapJson) - 10000;
    const screenshot = shots.find((shot) => shot.byteLength <= room) || null;

    const form = new FormData();
    form.set("meta", meta);
    form.set("html", new Blob([captured.html], { type: "text/html" }), "page.html");
    form.set("styleMap", new Blob([styleMapJson], { type: "application/json" }), "style-map.json");
    if (screenshot) form.set("screenshot", new Blob([screenshot], { type: "image/jpeg" }), "screenshot.jpg");

    const response = await fetch(options.upload, { method: "POST", body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) {
      throw new Error((body && body.error) || "the upload failed with status " + response.status + ".");
    }
    if (finalUrl !== options.url && new URL(finalUrl).pathname !== new URL(options.url).pathname) {
      console.log("Note: the app redirected to " + finalUrl + ". A page behind sign-in needs --cookie.");
    }
    if (!screenshot) console.log("Note: the page was too large to upload a screenshot, so pixels were not compared.");
    console.log(body.message);
    if (body.diffPng) {
      const file = join(tmpdir(), "wirely-diff-" + body.pageId + ".png");
      writeFileSync(file, Buffer.from(body.diffPng, "base64"));
      console.log("Diff image, the design faded with differences in red: " + file);
    }
    if (!options.page) {
      console.log("To capture this page again after a change, rerun the same command with --page " + body.pageId +
        " so it updates this page instead of adding another.");
    }
  } finally {
    if (cdp) cdp.close();
    if (chrome) {
      const exited = new Promise((resolve) => chrome.once("exit", resolve));
      chrome.kill();
      await Promise.race([exited, sleep(3000)]);
    }
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // The temporary profile is left for the OS to clear.
    }
  }
};

// Exits explicitly: the timeouts raced against page events would otherwise
// hold the process open until they fire.
main().then(
  () => process.exit(0),
  (error) => fail(error instanceof Error ? error.message : String(error)),
);
`;

/** Builds the capture script with the shared page functions and limits filled in. */
export const buildCaptureScript = ({
  maxHtmlChars,
  maxShotHeight,
  maxUploadBytes,
}: {
  maxHtmlChars: number;
  maxShotHeight: number;
  maxUploadBytes: number;
}) => {
  const values: Record<string, string> = {
    __SERIALIZE_PAGE__: serializePage.toString(),
    __COLLECT_STYLE_MAP__: collectStyleMap.toString(),
    __DEVICE_SIZES__: JSON.stringify({
      desktop: [PAGE_DEVICE_WIDTHS.desktop, PAGE_DEVICE_HEIGHTS.desktop],
      mobile: [PAGE_DEVICE_WIDTHS.mobile, PAGE_DEVICE_HEIGHTS.mobile],
    }),
    __MAX_HTML_CHARS__: String(maxHtmlChars),
    __MAX_SHOT_HEIGHT__: String(maxShotHeight),
    __MAX_UPLOAD_BYTES__: String(maxUploadBytes),
    __MAX_IMAGE_BYTES__: String(MAX_IMAGE_BYTES),
    __MAX_INLINED_IMAGE_BYTES__: String(MAX_INLINED_IMAGE_BYTES),
    __MAX_FONT_CHARS__: String(MAX_FONT_CHARS),
  };
  // A function replacer, so a "$&" inside the injected source stays literal.
  return TEMPLATE.replace(/__[A-Z_]+__/g, (name) => values[name] ?? name);
};
