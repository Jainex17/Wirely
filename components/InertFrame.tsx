"use client";

import React from "react";
import { buildInertPage, createIconStylesheet } from "@/lib/inertPage";
import { isCameraMoving, whenCameraRests } from "@/lib/cameraMotion";
import { INERT_HTML_ATTRIBUTE } from "@/lib/inertCss";
import type { InertFrame as InertFrameHandle } from "@/lib/inertPicker";
import { canCaptureSnapshots, captureSnapshot, enqueueSnapshot, settlePage } from "@/lib/pageSnapshot";
import { type PageSnapshot, loadSnapshot, saveSnapshot, snapshotKey } from "@/lib/pageSnapshotStore";

interface InertFrameProps {
  pageId: string;
  /** The page with its Tailwind already compiled. */
  html: string;
  width: number;
  /** The device frame's height, which viewport units resolve against. */
  viewportHeight: number;
  /** Hides the page without dropping it, while a live frame covers it. */
  isHidden: boolean;
  /**
   * Draw the page's snapshot instead of its DOM when it has one. The canvas
   * asks for DOM only where the page is large on screen or being worked on.
   */
  preferSnapshot: boolean;
  /**
   * The page may be snapshotted now. Not while it is being edited, since a
   * resize or inspector preview changes its DOM without changing its HTML.
   */
  canSnapshot: boolean;
  onMount: (frame: InertFrameHandle | null) => void;
  onHeightChange: (height: number) => void;
}

// Browsers ignore @font-face inside a shadow root, so the icon font is linked
// from the document as well, once, with its integrity hash.
const linkIconFont = () => {
  if (document.head.querySelector("link[data-wirely-inert]")) return;
  const link = createIconStylesheet(document);
  link.dataset.wirelyInert = "";
  document.head.append(link);
};

const measure = (page: HTMLElement | null) => (page ? Math.max(page.offsetHeight, page.scrollHeight) : 0);

// Building a page's DOM and laying it out takes tens of milliseconds, and a
// zoom in can ask a dozen pages for theirs at once. One build per frame keeps
// the canvas moving while they sharpen one by one. Pages the canvas wants as
// DOM, on screen or being worked on, go ahead of pages building only to be
// snapshotted. Urgency is read when the next build is picked, so a queued page
// the user zooms into or points at goes next. While the camera moves only
// those pages build, such as a page the agent just added that the camera
// glides to. The rest wait for it to rest, since each build drops a frame of
// the gesture.
type Build = { run: () => void; isUrgent: { readonly current: boolean } };
const builds: Build[] = [];
let buildFrame = 0;
let isWaitingForRest = false;
const requestBuild = () => {
  if (!buildFrame && builds.length > 0) buildFrame = window.requestAnimationFrame(runNextBuild);
};
const runNextBuild = () => {
  buildFrame = 0;
  const urgent = builds.findIndex(({ isUrgent }) => isUrgent.current);
  if (urgent === -1 && isCameraMoving()) {
    if (isWaitingForRest) return;
    isWaitingForRest = true;
    void whenCameraRests().then(() => {
      isWaitingForRest = false;
      requestBuild();
    });
    return;
  }
  const [next] = builds.splice(Math.max(0, urgent), 1);
  try {
    next?.run();
  } finally {
    // A page that fails to build must not stop the pages queued after it.
    requestBuild();
  }
};
const scheduleBuild = (build: Build) => {
  builds.push(build);
  requestBuild();
  return () => {
    const index = builds.indexOf(build);
    if (index !== -1) builds.splice(index, 1);
  };
};

const decodeSnapshot = (snapshot: PageSnapshot) => {
  const image = new Image();
  image.src = snapshot.url;
  return image.decode().catch(() => {});
};

// How long a page's HTML must hold still before it is snapshotted, so an
// agent writing a page in steps is not snapshotted at every step.
const SNAPSHOT_SETTLE_MS = 1_000;

/**
 * One idle page on the canvas: a snapshot picture while the page is small on
 * screen, or sanitized DOM in a shadow root, with no scripts and no iframe. It
 * rebuilds only when the page's HTML or frame size changes, so panning and
 * zooming never touch it. A page drawn as DOM with no snapshot of this HTML
 * yet is snapshotted once it settles.
 *
 * The outer element is what keeps the page in its frame. Page CSS cannot reach
 * it, since it sits outside the shadow root, and `contain: strict` makes it the
 * box for fixed content, clips what overflows, and stacks the page's z-indexes
 * under the editor's overlays. The host is `inert`, which no page CSS can undo:
 * nothing in the page takes focus, a click, or a hover. The canvas hit-tests it
 * through `lib/inertPicker.ts` instead.
 */
export default React.memo(function InertFrame({
  pageId,
  html,
  width,
  viewportHeight,
  isHidden,
  preferSnapshot,
  canSnapshot,
  onMount,
  onHeightChange,
}: InertFrameProps) {
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const pageRef = React.useRef<HTMLElement | null>(null);
  // Read through a ref, so a new callback never rebuilds the page.
  const callbacks = React.useRef({ onMount, onHeightChange });
  React.useLayoutEffect(() => {
    callbacks.current = { onMount, onHeightChange };
  });

  // The snapshot of this exact HTML and frame size, null when there is none,
  // or undefined while the lookup runs. The last snapshot shown stays up
  // through an edit's lookup, so a far page does not blink.
  const [lookup, setLookup] = React.useState<{
    html: string;
    width: number;
    viewportHeight: number;
    key: string;
    background: string;
    snapshot: PageSnapshot | null;
  } | null>(null);
  const current =
    lookup?.html === html && lookup.width === width && lookup.viewportHeight === viewportHeight ? lookup : undefined;
  const [shownSnapshot, setShownSnapshot] = React.useState<PageSnapshot | null>(null);
  if (current?.snapshot && current.snapshot !== shownSnapshot) setShownSnapshot(current.snapshot);
  React.useEffect(() => {
    let isCurrent = true;
    const background = outerRef.current ? getComputedStyle(outerRef.current).backgroundColor : "";
    void (async () => {
      try {
        const key = await snapshotKey(html, width, viewportHeight, background);
        const snapshot = await loadSnapshot(pageId, key);
        if (isCurrent) setLookup({ html, width, viewportHeight, key, background, snapshot });
      } catch {
        // No hashing (an insecure origin) means no snapshots: the page draws
        // as DOM, and an empty key never takes one.
        if (isCurrent) setLookup({ html, width, viewportHeight, key: "", background, snapshot: null });
      }
    })();
    return () => {
      isCurrent = false;
    };
  }, [html, pageId, viewportHeight, width]);

  // The HTML the host's shadow root holds, which outlives an edit until the
  // rebuild replaces it, so a page never blanks between versions.
  const [builtHtml, setBuiltHtml] = React.useState<string | null>(null);
  // While an edit's lookup runs, the page stays as it was drawn: DOM if it
  // was built, its last snapshot if not.
  const showDom = !preferSnapshot || (current ? current.snapshot === null : builtHtml !== null);
  if (!showDom && builtHtml !== null) setBuiltHtml(null);
  // Read by the build queue, so a change of urgency alone never rebuilds.
  const isUrgentRef = React.useRef(!preferSnapshot);
  React.useLayoutEffect(() => {
    isUrgentRef.current = !preferSnapshot;
    // A queued page that turns urgent mid gesture builds without waiting for it to end.
    if (!preferSnapshot) requestBuild();
  });

  React.useEffect(() => {
    if (!showDom) return;
    let teardown: (() => void) | null = null;
    const build = () => {
      const host = hostRef.current;
      if (!host) return;
      const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      const mount = (rootFontSize?: number) => {
        const viewport = { width, height: viewportHeight, rootFontSize };
        const { content, linksIconFont } = buildInertPage(html, viewport);
        root.replaceChildren(content);
        if (linksIconFont) linkIconFont();
        return viewport;
      };
      let viewport = mount();
      let page = root.querySelector<HTMLElement>(`[${INERT_HTML_ATTRIBUTE}]`);
      // rem reads the page's root font size, which only shows once its html rule
      // applies to the wrapper. A page that changes it builds once more with
      // rem in those pixels, and the wrapper keeps the size it measured at 16px.
      const rootFontSize = page ? Number.parseFloat(getComputedStyle(page).fontSize) : 16;
      if (Number.isFinite(rootFontSize) && rootFontSize !== 16) {
        viewport = mount(rootFontSize);
        page = root.querySelector<HTMLElement>(`[${INERT_HTML_ATTRIBUTE}]`);
        page?.style.setProperty("font-size", `${rootFontSize}px`);
      }
      pageRef.current = page;
      // A page off screen is not laid out and measures 0, which is no height.
      const observer = new ResizeObserver(() => {
        const height = measure(page);
        if (height > 0) callbacks.current.onHeightChange(height);
      });
      if (page) observer.observe(page);
      callbacks.current.onMount({ root, host, viewport });
      setBuiltHtml(html);
      teardown = () => {
        observer.disconnect();
        pageRef.current = null;
        callbacks.current.onMount(null);
      };
    };
    // An edit to a page already built rebuilds at once, as it always has, so
    // its frame handle and the agent cursor on it never drop for a frame.
    const cancelBuild = hostRef.current?.shadowRoot?.hasChildNodes()
      ? (build(), () => {})
      : scheduleBuild({ run: build, isUrgent: isUrgentRef });
    return () => {
      cancelBuild();
      teardown?.();
    };
  }, [html, showDom, viewportHeight, width]);

  // A page built from this HTML with no snapshot of it yet takes one once it settles.
  const toSnapshot = canSnapshot && builtHtml === html && current?.snapshot === null && current.key ? current : null;
  React.useEffect(() => {
    if (!toSnapshot) return;
    let isCurrent = true;
    const timer = window.setTimeout(() => {
      enqueueSnapshot(async () => {
        const root = hostRef.current?.shadowRoot;
        if (!isCurrent || !root || !canCaptureSnapshots()) return;
        await settlePage(root);
        const outer = outerRef.current;
        if (!isCurrent || !outer) return;
        // The page as laid out with its images, which can run past a frame
        // that has not grown to fit it yet.
        const height = Math.max(outer.clientHeight, measure(pageRef.current));
        const blob = await captureSnapshot({ root, width, height, background: toSnapshot.background });
        if (!blob || !isCurrent) return;
        const snapshot = await saveSnapshot(pageId, toSnapshot.key, blob, height);
        // Decoded before it replaces the DOM, so the swap shows no blank frame.
        await decodeSnapshot(snapshot);
        if (isCurrent) setLookup({ ...toSnapshot, snapshot });
      });
    }, SNAPSHOT_SETTLE_MS);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [pageId, toSnapshot, width]);

  // A page drawn from its snapshot still tells the canvas its height, which a
  // page that never built its DOM this visit has no other way to learn.
  const snapshotHeight = !showDom ? current?.snapshot?.height : undefined;
  React.useEffect(() => {
    if (snapshotHeight) callbacks.current.onHeightChange(snapshotHeight);
  }, [snapshotHeight]);

  // A live frame reported the height while this one was hidden, and its
  // scripts may have made the page taller, so the inert page measures again.
  React.useEffect(() => {
    if (isHidden) return;
    const height = measure(pageRef.current);
    if (height > 0) callbacks.current.onHeightChange(height);
  }, [isHidden]);

  return (
    <div
      ref={outerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-background"
      style={{
        contain: "strict",
        contentVisibility: "auto",
        // `all: initial` below leaves custom properties alone, so without this
        // every zoom step would restyle the whole page through the canvas's
        // inherited zoom variable. Pinning it here stops the restyle at this box.
        ["--canvas-inverse-zoom" as string]: "initial",
      }}
    >
      {/* Shown until the DOM builds over it, so a page sharpening never
          blanks, and kept mounted after, so zooming back out swaps to a
          picture already loaded. */}
      {shownSnapshot ? (
        // A blob URL of a JPEG drawn here, which next/image cannot serve.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={shownSnapshot.url}
          draggable={false}
          className="absolute left-0 top-0 w-full select-none"
          style={{
            height: shownSnapshot.height,
            visibility: isHidden || builtHtml !== null ? "hidden" : "visible",
          }}
        />
      ) : null}
      {/* `all: initial` stops the editor's fonts and colors from inheriting
          into the page, as if it had its own document. It resets inherited
          visibility too, so that is set again after it. */}
      {showDom ? (
        <div
          ref={hostRef}
          inert
          style={{
            all: "initial",
            display: "block",
            width: "100%",
            height: "100%",
            userSelect: "none",
            visibility: isHidden ? "hidden" : "visible",
          }}
        />
      ) : null}
    </div>
  );
});
