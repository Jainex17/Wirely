"use client";

import React from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPageFrameSize } from "@/lib/canvasScene";
import { injectIframeHeightReporter } from "@/lib/frameHeightReporter";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/useEditorStore";

type CompareMode = "side" | "overlay" | "difference";

const MODES: Array<{ mode: CompareMode; label: string }> = [
  { mode: "side", label: "Side by side" },
  { mode: "overlay", label: "Overlay" },
  { mode: "difference", label: "Difference" },
];

const SIDE_GAP_PX = 16;
/** The canvas caps page frames at the same height. */
const MAX_DOCUMENT_HEIGHT = 20_000;
const FRAME_IDS = ["compare-left", "compare-right"] as const;

const SCROLL_MESSAGE = "wirely-compare-scroll";

/**
 * Lets the dialog scroll the frame, which takes no pointer events, and hides
 * the frame's own scrollbar. Only messages from the dialog's window count.
 */
const FOLLOW_SCROLL_SCRIPT =
  "<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>" +
  `<script>addEventListener("message",function(e){if(e.source===parent&&e.data&&e.data.type===${JSON.stringify(SCROLL_MESSAGE)}&&typeof e.data.y==="number")scrollTo(0,e.data.y)});</script>`;

const addFollowScroll = (html: string) =>
  /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${FOLLOW_SCROLL_SCRIPT}</body>`) : `${html}${FOLLOW_SCROLL_SCRIPT}`;

/**
 * One page in a frame as tall as the dialog's scroll area. It reports its full
 * document height by message and scrolls when the dialog tells it to. The
 * frame never takes the document height itself: a 100vh section would grow
 * with it and the report would never settle.
 */
function CompareFrame({
  id,
  title,
  html,
  width,
  height,
  scrollY,
  frameRef,
}: {
  id: (typeof FRAME_IDS)[number];
  title: string;
  html: string;
  width: number;
  height: number;
  scrollY: number;
  frameRef: (node: HTMLIFrameElement | null) => void;
}) {
  const srcDoc = React.useMemo(
    () => addFollowScroll(injectIframeHeightReporter(sanitizeIframeHtml(html), id)),
    [html, id],
  );
  return (
    <iframe
      ref={frameRef}
      title={`${title} to compare`}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      tabIndex={-1}
      className="pointer-events-none block border-0 bg-white"
      style={{ width, height }}
      onLoad={(event) =>
        event.currentTarget.contentWindow?.postMessage({ type: SCROLL_MESSAGE, y: scrollY }, "*")
      }
    />
  );
}

/**
 * Two pages side by side or stacked, for checking a build against the design
 * it came from. A build check links here with `?compare=<design>,<build>`,
 * and any page opens it from its menu. In Difference, the top page blends
 * with mix-blend-mode: difference, so what matches turns black and what moved
 * or changed shows bright. The frames stay pinned in view while the dialog's
 * scroll area, as tall as the longer document, scrolls both by message.
 */
export default function PageCompareDialog() {
  const comparePageIds = useEditorStore((state) => state.comparePageIds);
  const setComparePageIds = useEditorStore((state) => state.setComparePageIds);
  const pages = useEditorStore((state) => state.pages);
  const [mode, setMode] = React.useState<CompareMode>("side");
  const [opacity, setOpacity] = React.useState(50);
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [area, setArea] = React.useState({ width: 0, height: 0 });
  const [scrollY, setScrollY] = React.useState(0);
  const areaObserverRef = React.useRef<ResizeObserver | null>(null);
  const framesRef = React.useRef<Record<string, HTMLIFrameElement | null>>({});

  const comparable = pages.filter((page) => page.deviceType !== "vector");
  const left = pages.find((page) => page.id === comparePageIds?.[0]);
  const right = pages.find((page) => page.id === comparePageIds?.[1]);
  const open = Boolean(comparePageIds && left && right);

  const leftHtml = left?.iframeHtml ?? "";
  const rightHtml = right?.iframeHtml ?? "";

  React.useEffect(() => {
    if (!open) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; id?: unknown; height?: unknown } | null;
      if (
        data?.type === "wirely-iframe-height" &&
        (data.id === FRAME_IDS[0] || data.id === FRAME_IDS[1]) &&
        typeof data.height === "number" &&
        Number.isFinite(data.height)
      ) {
        const id = data.id;
        const height = Math.min(MAX_DOCUMENT_HEIGHT, Math.max(1, Math.round(data.height)));
        setHeights((current) => (current[id] === height ? current : { ...current, [id]: height }));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open]);

  const resetHeights = () => setHeights({});

  const scrollFrames = (y: number) => {
    setScrollY(y);
    for (const frame of Object.values(framesRef.current)) {
      frame?.contentWindow?.postMessage({ type: SCROLL_MESSAGE, y }, "*");
    }
  };

  // A callback ref, since the dialog mounts its content only while open.
  const measureArea = React.useCallback((node: HTMLDivElement | null) => {
    areaObserverRef.current?.disconnect();
    areaObserverRef.current = null;
    if (!node) return;
    const measure = () => setArea({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    areaObserverRef.current = observer;
    measure();
  }, []);

  const close = () => {
    setComparePageIds(null);
    resetHeights();
    // A reload should not reopen a comparison the user closed.
    const url = new URL(window.location.href);
    if (url.searchParams.has("compare")) {
      url.searchParams.delete("compare");
      window.history.replaceState(null, "", url);
    }
  };

  if (!comparePageIds || !left || !right) return null;

  const leftSize = getPageFrameSize({ deviceType: left.deviceType, iframeHtml: leftHtml }, "desktop");
  const rightSize = getPageFrameSize({ deviceType: right.deviceType, iframeHtml: rightHtml }, "desktop");
  const sideBySide = mode === "side";
  const contentWidth = sideBySide
    ? leftSize.width + rightSize.width + SIDE_GAP_PX
    : Math.max(leftSize.width, rightSize.width);
  const scale = area.width > 0 ? Math.min(1, area.width / contentWidth) : 0;
  // The frames fill the scroll area. Their height follows the dialog's size,
  // never the documents', so a 100vh section has nothing to grow with.
  const viewportHeight = scale > 0 ? Math.round(area.height / scale) : leftSize.height;
  const documentHeight = Math.max(
    viewportHeight,
    heights[FRAME_IDS[0]] ?? leftSize.height,
    heights[FRAME_IDS[1]] ?? rightSize.height,
  );

  const pickPage = (side: 0 | 1, pageId: string) => {
    const next: [string, string] = [...comparePageIds];
    next[side] = pageId;
    if (next[0] !== next[1]) {
      setComparePageIds(next);
      resetHeights();
    }
  };

  const pageSelect = (side: 0 | 1) => (
    <select
      value={comparePageIds[side]}
      onChange={(event) => pickPage(side, event.target.value)}
      className="h-8 min-w-0 max-w-56 truncate rounded-md border border-border bg-background px-2 text-xs"
      aria-label={side === 0 ? "First page" : "Second page"}
    >
      {comparable.map((page) => (
        <option key={page.id} value={page.id} disabled={page.id === comparePageIds[side === 0 ? 1 : 0]}>
          {page.title}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] flex-col gap-3 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Compare pages</DialogTitle>
          <DialogDescription>
            Check a build against its design. In Difference, matching areas turn black.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {pageSelect(0)}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Swap pages"
            title="Swap pages"
            onClick={() => {
              setComparePageIds([comparePageIds[1], comparePageIds[0]]);
              resetHeights();
            }}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          {pageSelect(1)}
          <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
            {MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => setMode(option.mode)}
                className={cn(
                  "h-7 rounded px-2 text-xs",
                  mode === option.mode ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {mode === "overlay" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Second page
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                aria-label="Second page opacity"
              />
            </label>
          ) : null}
        </div>
        <div
          ref={measureArea}
          onScroll={(event) => scale > 0 && scrollFrames(event.currentTarget.scrollTop / scale)}
          className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted"
        >
          {scale > 0 ? (
            <div style={{ width: contentWidth * scale, height: documentHeight * scale }}>
              <div className="sticky top-0" style={{ width: contentWidth * scale, height: viewportHeight * scale }}>
                <div
                  className={cn("relative", sideBySide && "flex items-start")}
                  style={{
                    width: contentWidth,
                    gap: sideBySide ? SIDE_GAP_PX : undefined,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    isolation: "isolate",
                  }}
                >
                  <CompareFrame
                    id={FRAME_IDS[0]}
                    title={left.title}
                    html={leftHtml}
                    width={leftSize.width}
                    height={viewportHeight}
                    scrollY={scrollY}
                    frameRef={(node) => {
                      framesRef.current[FRAME_IDS[0]] = node;
                    }}
                  />
                  <div
                    className={sideBySide ? undefined : "absolute left-0 top-0"}
                    style={{
                      opacity: mode === "overlay" ? opacity / 100 : 1,
                      mixBlendMode: mode === "difference" ? "difference" : undefined,
                    }}
                  >
                    <CompareFrame
                      id={FRAME_IDS[1]}
                      title={right.title}
                      html={rightHtml}
                      width={rightSize.width}
                      height={viewportHeight}
                      scrollY={scrollY}
                      frameRef={(node) => {
                        framesRef.current[FRAME_IDS[1]] = node;
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
