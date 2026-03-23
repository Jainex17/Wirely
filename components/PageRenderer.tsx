import React from "react";
import { FileIcon, MoreHorizontal, PencilLine } from "lucide-react";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const stabilizeViewportHeightClasses = (
  html: string,
  viewportHeight: number,
) => {
  if (!html) return html;

  const safeViewportHeight = Math.max(1, Math.round(viewportHeight));
  const vhToPx = (value: string) => {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed)) return `${safeViewportHeight}px`;
    return `${Math.max(1, Math.round((parsed / 100) * safeViewportHeight))}px`;
  };

  return html
    .replace(
      /\bmin-h-(screen|dvh|svh|lvh)\b/g,
      `min-h-[${safeViewportHeight}px]`,
    )
    .replace(/\bh-(screen|dvh|svh|lvh)\b/g, `h-[${safeViewportHeight}px]`)
    .replace(
      /\bmax-h-(screen|dvh|svh|lvh)\b/g,
      `max-h-[${safeViewportHeight}px]`,
    )
    .replace(
      /(min-h|max-h|h)-\[(\d*\.?\d+)(vh|dvh|svh|lvh)\]/g,
      (_match, prefix: string, rawValue: string) =>
        `${prefix}-[${vhToPx(rawValue)}]`,
    );
};

const injectIframeHeightReporter = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const reporterId=${JSON.stringify(reporterId)};let rafId=0;const measure=()=>{const root=document.documentElement;const body=document.body;if(!root||!body)return;const bodyRect=body.getBoundingClientRect();let maxHeight=Math.max(root.scrollHeight||0,root.offsetHeight||0,root.clientHeight||0,body.scrollHeight||0,body.offsetHeight||0,body.clientHeight||0);const allElements=body.querySelectorAll("*");for(const node of allElements){const element=node;const computed=window.getComputedStyle(element);if(computed.display==="none")continue;const rect=element.getBoundingClientRect();const relativeTop=rect.top-bodyRect.top;const visualBottom=rect.bottom-bodyRect.top;const scrollBottom=relativeTop+Math.max(element.scrollHeight||0,element.clientHeight||0,element.offsetHeight||0);maxHeight=Math.max(maxHeight,visualBottom,scrollBottom);}window.parent.postMessage({type:"wirely-iframe-height",id:reporterId,height:Math.ceil(maxHeight)},"*");};const queueMeasure=()=>{if(rafId)return;rafId=window.requestAnimationFrame(()=>{rafId=0;measure();});};if(typeof ResizeObserver==="function"){const resizeObserver=new ResizeObserver(queueMeasure);resizeObserver.observe(document.documentElement);resizeObserver.observe(document.body);}if(typeof MutationObserver==="function"){const mutationObserver=new MutationObserver(queueMeasure);mutationObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}window.addEventListener("load",queueMeasure);document.addEventListener("DOMContentLoaded",queueMeasure);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(queueMeasure).catch(()=>{});}window.setTimeout(queueMeasure,40);window.setTimeout(queueMeasure,180);window.setTimeout(queueMeasure,500);window.setTimeout(queueMeasure,1200);queueMeasure();})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
};

interface PageRendererProps {
  page: {
    id: string;
    title: string;
    iframeUrl?: string;
    iframeHtml?: string;
  };
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onEditPage?: (pageId: string) => void;
  currentDevice: {
    width: number;
    height: number;
    label: string;
  };
  zoom: number;
}

export default React.memo(function PageRenderer({
  page,
  onEditPage,
  currentDevice,
  zoom,
}: PageRendererProps) {
  const MAX_IFRAME_HEIGHT = 20000;
  const CHART_CANVAS_HEIGHT = 320;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const mutationObserverRef = React.useRef<MutationObserver | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const timeoutIdsRef = React.useRef<number[]>([]);
  const imageListenerCleanupRef = React.useRef<(() => void) | null>(null);
  const [iframeHeight, setIframeHeight] = React.useState(currentDevice.height);
  const hasRawHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const sanitizedHtml = React.useMemo(
    () => (hasRawHtml ? sanitizeIframeHtml(page.iframeHtml ?? "") : ""),
    [hasRawHtml, page.iframeHtml],
  );
  const hasHtml = sanitizedHtml.trim().length > 0;
  const iframeReporterId = React.useMemo(
    () => `wirely-height-${page.id}-${sanitizedHtml.length}`,
    [page.id, sanitizedHtml.length],
  );
  const canvasSrcDoc = React.useMemo(
    () =>
      hasHtml
        ? stabilizeViewportHeightClasses(sanitizedHtml, currentDevice.height)
        : "",
    [hasHtml, sanitizedHtml, currentDevice.height],
  );
  const measuredSrcDoc = React.useMemo(
    () =>
      hasHtml ? injectIframeHeightReporter(canvasSrcDoc, iframeReporterId) : "",
    [canvasSrcDoc, hasHtml, iframeReporterId],
  );
  const titleScale = React.useMemo(() => 100 / Math.max(20, zoom), [zoom]);
  const titleFontSizePx = React.useMemo(
    () => Math.min(40, Math.max(14, 16 * titleScale)),
    [titleScale],
  );
  const titleIconSizePx = React.useMemo(
    () => Math.min(28, Math.max(12, 14 * titleScale)),
    [titleScale],
  );
  const disconnectAutoHeightSync = React.useCallback(() => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    for (const timeoutId of timeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    timeoutIdsRef.current = [];
    if (imageListenerCleanupRef.current) {
      imageListenerCleanupRef.current();
      imageListenerCleanupRef.current = null;
    }
  }, []);

  const stabilizeChartCanvases = React.useCallback(() => {
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) return;

    const canvases = Array.from(doc.querySelectorAll("canvas"));
    for (const canvas of canvases) {
      const element = canvas as HTMLCanvasElement;
      // Prevent responsive chart libraries from entering parent-child resize loops.
      if (!element.style.height) {
        element.style.height = `${CHART_CANVAS_HEIGHT}px`;
      }
      element.style.maxHeight = `${CHART_CANVAS_HEIGHT}px`;
      element.style.minHeight = `${CHART_CANVAS_HEIGHT}px`;
      element.style.width = "100%";
      element.style.display = "block";
      if (!element.hasAttribute("height")) {
        element.setAttribute("height", String(CHART_CANVAS_HEIGHT));
      }

      const parent = element.parentElement;
      if (parent) {
        if (!parent.style.minHeight) {
          parent.style.minHeight = `${CHART_CANVAS_HEIGHT}px`;
        }
        parent.style.overflow = "hidden";
      }
    }
  }, []);

  const syncIframeHeight = React.useCallback(() => {
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) return;
    stabilizeChartCanvases();
    const bodyRect = doc.body.getBoundingClientRect();
    const docWindow = doc.defaultView ?? window;
    let farthestBottom = Math.max(
      doc.documentElement?.getBoundingClientRect().bottom - bodyRect.top,
      doc.body?.getBoundingClientRect().bottom - bodyRect.top,
      0,
    );

    const allElements = doc.body.querySelectorAll("*");
    for (const node of allElements) {
      const element = node as HTMLElement;
      const computed = docWindow.getComputedStyle(element);
      if (computed.position === "fixed") continue;
      if (computed.display === "none") continue;
      const rect = element.getBoundingClientRect();
      const relativeTop = rect.top - bodyRect.top;
      const visualBottom = rect.bottom - bodyRect.top;
      const scrollContainerBottom =
        relativeTop +
        Math.max(
          element.scrollHeight || 0,
          element.clientHeight || 0,
          element.offsetHeight || 0,
        );
      farthestBottom = Math.max(
        farthestBottom,
        visualBottom,
        scrollContainerBottom,
      );
    }

    const measuredHeight = Math.max(
      currentDevice.height,
      doc.scrollingElement?.scrollHeight ?? 0,
      doc.scrollingElement?.clientHeight ?? 0,
      doc.documentElement?.scrollHeight ?? 0,
      doc.documentElement?.offsetHeight ?? 0,
      doc.documentElement?.clientHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
      doc.body?.offsetHeight ?? 0,
      doc.body?.clientHeight ?? 0,
      Math.ceil(farthestBottom),
    );
    const boundedHeight = Math.min(
      MAX_IFRAME_HEIGHT,
      Math.max(currentDevice.height, measuredHeight),
    );
    setIframeHeight(boundedHeight);
  }, [currentDevice.height, stabilizeChartCanvases]);

  const queueIframeHeightSync = React.useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncIframeHeight();
    });
  }, [syncIframeHeight]);

  const startAutoHeightSync = React.useCallback(() => {
    disconnectAutoHeightSync();
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      doc = null;
    }
    if (!doc) return;

    queueIframeHeightSync();

    const resizeObserver = new ResizeObserver(() => {
      queueIframeHeightSync();
    });
    resizeObserverRef.current = resizeObserver;
    resizeObserver.observe(doc.documentElement);
    resizeObserver.observe(doc.body);

    const mutationObserver = new MutationObserver(() => {
      queueIframeHeightSync();
    });
    mutationObserverRef.current = mutationObserver;
    mutationObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const images = Array.from(doc.images);
    const onImageLoad = () => queueIframeHeightSync();
    for (const image of images) {
      image.addEventListener("load", onImageLoad);
      image.addEventListener("error", onImageLoad);
    }
    imageListenerCleanupRef.current = () => {
      for (const image of images) {
        image.removeEventListener("load", onImageLoad);
        image.removeEventListener("error", onImageLoad);
      }
    };

    void doc.fonts?.ready?.then(() => {
      queueIframeHeightSync();
    });

    timeoutIdsRef.current.push(window.setTimeout(queueIframeHeightSync, 250));
    timeoutIdsRef.current.push(window.setTimeout(queueIframeHeightSync, 900));
    timeoutIdsRef.current.push(window.setTimeout(queueIframeHeightSync, 1800));
  }, [disconnectAutoHeightSync, queueIframeHeightSync]);

  const handleLoad = React.useCallback(() => {
    startAutoHeightSync();
  }, [startAutoHeightSync]);

  React.useEffect(() => {
    setIframeHeight(currentDevice.height);
    disconnectAutoHeightSync();
    return () => {
      disconnectAutoHeightSync();
    };
  }, [currentDevice.height, disconnectAutoHeightSync, page.id, page.iframeHtml]);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const payload = data as {
        type?: string;
        id?: string;
        height?: number;
      };
      if (payload.type !== "wirely-iframe-height") return;
      if (payload.id !== iframeReporterId) return;
      if (typeof payload.height !== "number" || !Number.isFinite(payload.height)) {
        return;
      }

      const boundedHeight = Math.min(
        MAX_IFRAME_HEIGHT,
        Math.max(currentDevice.height, Math.ceil(payload.height)),
      );
      setIframeHeight((previous) =>
        previous === boundedHeight ? previous : boundedHeight,
      );
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [currentDevice.height, iframeReporterId]);

  return (
    <div className="group relative flex flex-col items-center gap-1">
      <div className="flex h-[50px] w-full items-center justify-between gap-3 pl-3 pr-1 pb-1">
        <p
          className="flex items-center gap-2 font-medium text-foreground"
          style={{ fontSize: `${titleFontSizePx}px` }}
        >
          <FileIcon
            className="text-muted-foreground"
            style={{ width: `${titleIconSizePx}px`, height: `${titleIconSizePx}px` }}
          />
          {page.title}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
              aria-label={`Open tools for ${page.title}`}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-36"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
          >
            <DropdownMenuItem
              onSelect={() => onEditPage?.(page.id)}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <PencilLine className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="relative overflow-hidden rounded-[var(--radius)] border border-border bg-transparent shadow-lg transition-all duration-150 group-hover:border-4 group-hover:border-blue-500 group-hover:ring-2 group-hover:ring-blue-500/30"
        style={{
          width: `${currentDevice.width}px`,
          minHeight: `${currentDevice.height}px`,
          height: hasHtml ? `${iframeHeight}px` : `${currentDevice.height}px`,
        }}
      >
        {hasHtml ? (
          <iframe
            ref={iframeRef}
            title={page.title}
            srcDoc={measuredSrcDoc}
            onLoad={handleLoad}
            className="h-full w-full border-0 pointer-events-none bg-background"
            style={{ overflow: "hidden" }}
            loading="eager"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            scrolling="no"
          />
        ) : (
          <GeneratingPreviewPlaceholder />
        )}
      </div>
    </div>
  );
});
