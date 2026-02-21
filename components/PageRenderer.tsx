import React from "react";
import { FileIcon } from "lucide-react";
import { useEditorStore } from "@/store/useEditorStore";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import PageOptionsMenu from "./PageOptionsMenu";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";

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

interface PageRendererProps {
  page: {
    id: string;
    title: string;
    iframeUrl?: string;
    iframeHtml?: string;
  };
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  currentDevice: {
    width: number;
    height: number;
    label: string;
  };
}

export default React.memo(function PageRenderer({
  page,
  onRenamePage,
  onDeletePage,
  currentDevice,
}: PageRendererProps) {
  const MAX_IFRAME_HEIGHT = 5000;
  const CHART_CANVAS_HEIGHT = 320;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = React.useState(currentDevice.height);
  const hasRawHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const sanitizedHtml = React.useMemo(
    () => (hasRawHtml ? sanitizeIframeHtml(page.iframeHtml ?? "") : ""),
    [hasRawHtml, page.iframeHtml],
  );
  const hasHtml = sanitizedHtml.trim().length > 0;
  const canvasSrcDoc = React.useMemo(
    () =>
      hasHtml
        ? stabilizeViewportHeightClasses(sanitizedHtml, currentDevice.height)
        : "",
    [hasHtml, sanitizedHtml, currentDevice.height],
  );
  const isOnlyPage = useEditorStore((state) => state.pages.length <= 1);
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
    // eslint-disable-next-line react-hooks/immutability
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    const measuredHeight = Math.max(
      currentDevice.height,
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    );
    const boundedHeight = Math.min(
      MAX_IFRAME_HEIGHT,
      Math.max(currentDevice.height, measuredHeight),
    );
    setIframeHeight(boundedHeight);
  }, [currentDevice.height, stabilizeChartCanvases]);

  const handleLoad = React.useCallback(() => {
    syncIframeHeight();
    window.setTimeout(syncIframeHeight, 250);
    window.setTimeout(syncIframeHeight, 900);
  }, [syncIframeHeight]);

  React.useEffect(() => {
    setIframeHeight(currentDevice.height);
  }, [currentDevice.height, page.id, page.iframeHtml]);

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div className="w-full h-[50px] flex items-center pl-4 pr-2 rounded-[var(--radius)] justify-between bg-secondary">
        <p className="text-foreground font-medium text-md flex items-center gap-2">
          <FileIcon width={18} />
          {page.title}
        </p>
        <PageOptionsMenu
          pageTitle={page.title}
          isOnlyPage={isOnlyPage}
          onRename={(newTitle) => onRenamePage(page.id, newTitle)}
          onDelete={() => onDeletePage(page.id)}
        />
      </div>
      <div
        className="bg-transparent rounded-[var(--radius)] relative border border-border shadow-lg overflow-hidden"
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
            srcDoc={canvasSrcDoc}
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
