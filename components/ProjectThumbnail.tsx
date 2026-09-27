"use client";

import { useEffect, useRef, useState } from "react";

import { PAGE_DEVICE_HEIGHTS, PAGE_DEVICE_WIDTHS } from "@/lib/canvasScene";
import { injectFrameMotion } from "@/lib/frameMotion";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";

interface PreviewPage {
  id: string;
  title: string;
  deviceType: string;
  htmlContent: string | null;
}

// One scale for every frame, as on the canvas, so a phone page reads smaller
// than a desktop one.
const SCALE = 0.1;

type PreviewState = { status: "idle" | "loading" | "failed" } | { status: "ready"; pages: PreviewPage[] };

/**
 * A home card's view of its canvas: the top screen of the first few pages side
 * by side and centred, running off both edges when they do not fit. It fetches
 * only once the card nears the viewport, and frames get the editor's
 * sanitizer, sandbox, and animation hold, so a long project list costs nothing
 * until it scrolls into view.
 */
export default function ProjectThumbnail({ projectId }: { projectId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setState({ status: "loading" });
        try {
          const response = await fetch(`/api/projects/${projectId}/preview`);
          if (!response.ok) throw new Error(`Preview failed with ${response.status}`);
          const payload = (await response.json()) as { pages?: PreviewPage[] };
          if (!cancelled) setState({ status: "ready", pages: payload.pages ?? [] });
        } catch {
          if (!cancelled) setState({ status: "failed" });
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [projectId]);

  const pages =
    state.status === "ready" ? state.pages.filter((page) => page.htmlContent?.trim()) : [];

  return (
    <div
      ref={containerRef}
      className="relative aspect-[16/10] overflow-hidden rounded-lg bg-[#1a1c22]"
    >
      <div className="canvas-dots pointer-events-none absolute inset-0" />
      {state.status === "ready" && pages.length === 0 ? (
        <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          Empty canvas
        </p>
      ) : null}
      {pages.length > 0 ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]">
          {pages.map((page) => {
            const device = page.deviceType === "mobile" ? "mobile" : "desktop";
            const width = PAGE_DEVICE_WIDTHS[device];
            const height = PAGE_DEVICE_HEIGHTS[device];
            return (
              <div
                key={page.id}
                className="relative shrink-0 overflow-hidden rounded-[2px] bg-white shadow-[0_6px_18px_-10px_rgb(0_0_0/0.8)]"
                style={{ width: width * SCALE, height: height * SCALE }}
              >
                <iframe
                  title={page.title}
                  srcDoc={injectFrameMotion(sanitizeIframeHtml(page.htmlContent ?? ""), page.id)}
                  sandbox="allow-scripts"
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                  style={{ width, height, transform: `scale(${SCALE})` }}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
