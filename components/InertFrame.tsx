"use client";

import React from "react";
import { buildInertPage, createIconStylesheet } from "@/lib/inertPage";
import { INERT_HTML_ATTRIBUTE } from "@/lib/inertCss";
import type { InertFrame as InertFrameHandle } from "@/lib/inertPicker";

interface InertFrameProps {
  /** The page with its Tailwind already compiled. */
  html: string;
  width: number;
  /** The device frame's height, which viewport units resolve against. */
  viewportHeight: number;
  /** Hides the page without dropping it, while a live frame covers it. */
  isHidden: boolean;
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

/**
 * One idle page on the canvas as sanitized DOM in a shadow root, with no
 * scripts and no iframe. It rebuilds only when the page's HTML or frame size
 * changes, so panning and zooming never touch it.
 *
 * The outer element is what keeps the page in its frame. Page CSS cannot reach
 * it, since it sits outside the shadow root, and `contain: strict` makes it the
 * box for fixed content, clips what overflows, and stacks the page's z-indexes
 * under the editor's overlays. The host is `inert`, which no page CSS can undo:
 * nothing in the page takes focus, a click, or a hover. The canvas hit-tests it
 * through `lib/inertPicker.ts` instead.
 */
export default React.memo(function InertFrame({
  html,
  width,
  viewportHeight,
  isHidden,
  onMount,
  onHeightChange,
}: InertFrameProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const pageRef = React.useRef<HTMLElement | null>(null);
  // Read through a ref, so a new callback never rebuilds the page.
  const callbacks = React.useRef({ onMount, onHeightChange });
  React.useLayoutEffect(() => {
    callbacks.current = { onMount, onHeightChange };
  });

  React.useEffect(() => {
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
    return () => {
      observer.disconnect();
      pageRef.current = null;
      callbacks.current.onMount(null);
    };
  }, [html, viewportHeight, width]);

  // A live frame reported the height while this one was hidden, and its
  // scripts may have made the page taller, so the inert page measures again.
  React.useEffect(() => {
    if (isHidden) return;
    const height = measure(pageRef.current);
    if (height > 0) callbacks.current.onHeightChange(height);
  }, [isHidden]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-background"
      style={{ contain: "strict", contentVisibility: "auto" }}
    >
      {/* `all: initial` stops the editor's fonts and colors from inheriting
          into the page, as if it had its own document. It resets inherited
          visibility too, so that is set again after it. */}
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
    </div>
  );
});
