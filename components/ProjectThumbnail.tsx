"use client";

import { useEffect, useRef, useState } from "react";

import { getPageFrameSize } from "@/lib/canvasScene";
import { injectFrameMotion } from "@/lib/frameMotion";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { precompileFrameHtml } from "@/lib/tailwindFrameBrowser";

interface PreviewPage {
  id: string;
  title: string;
  deviceType: string;
  htmlContent: string | null;
}

// One scale for every frame, as on the canvas, so a phone page reads smaller
// than a desktop one.
const SCALE = 0.1;

type PreviewFrame = PreviewPage & { srcDoc: string };

type PreviewState =
  | { status: "idle" | "loading" | "failed" }
  | { status: "ready"; frames: PreviewFrame[] }
  | { status: "image"; url: string };

/**
 * A home card's view of its canvas: the top screen of the first few pages side
 * by side and centred, running off both edges when they do not fit. It fetches
 * only once the card nears the viewport, and frames get the editor's
 * sanitizer, sandbox, and animation hold, so a long project list costs nothing
 * until it scrolls into view. Frames load the editor's precompiled Tailwind
 * CSS, so a screen of cards does not run the Tailwind browser compiler once
 * per frame.
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
          const payload = (await response.json()) as { pages?: PreviewPage[]; thumbnailUrl?: string };
          if (payload.thumbnailUrl) {
            if (!cancelled) setState({ status: "image", url: payload.thumbnailUrl });
            return;
          }
          const pages = (payload.pages ?? []).filter((page) => page.htmlContent?.trim());
          const frames = await Promise.all(
            pages.map(async (page) => ({
              ...page,
              srcDoc: injectFrameMotion(
                await precompileFrameHtml(sanitizeIframeHtml(page.htmlContent ?? "")),
                page.id,
              ),
            })),
          );
          if (!cancelled) setState({ status: "ready", frames });
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

  const frames = state.status === "ready" ? state.frames : [];

  return (
    <div
      ref={containerRef}
      className="relative aspect-[16/10] overflow-hidden rounded-lg bg-[#1a1c22]"
    >
      <div className="canvas-dots pointer-events-none absolute inset-0" />
      {(state.status === "ready" && frames.length === 0) || state.status === "failed" ? (
        <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          {state.status === "failed" ? "Preview unavailable" : "Empty canvas"}
        </p>
      ) : null}
      {state.status === "image" ? (
        // A design project's canvas, rendered on the server. A 204 for an
        // empty canvas shows nothing over the dots.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.url}
          alt=""
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
        />
      ) : null}
      {frames.length > 0 ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]">
          {frames.map((page) => {
            const { width, height } = getPageFrameSize(
              { deviceType: page.deviceType, iframeHtml: page.htmlContent },
              "desktop",
            );
            return (
              <div
                key={page.id}
                className="relative shrink-0 overflow-hidden rounded-[2px] bg-white shadow-[0_6px_18px_-10px_rgb(0_0_0/0.8)]"
                style={{ width: width * SCALE, height: height * SCALE }}
              >
                <iframe
                  title={page.title}
                  srcDoc={page.srcDoc}
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
