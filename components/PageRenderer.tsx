import React from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileIcon,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Trash2,
  X,
} from "lucide-react";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { PageRenderMode } from "@/lib/canvasScene";
import type { PageStatusRecord } from "@/store/useEditorStore";

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
    deviceType?: "desktop" | "mobile";
  };
  onRenamePage: (pageId: string, newTitle: string) => void;
  onDeletePage: (pageId: string) => void;
  onEditPage?: (pageId: string) => void;
  onFocusPage?: (pageId: string) => void;
  onMeasuredHeightChange?: (pageId: string, height: number) => void;
  currentDevice: {
    width: number;
    height: number;
    label: string;
  };
  status?: PageStatusRecord | null;
  isOnlyPage: boolean;
  isFocused: boolean;
  frameHeight: number;
  renderMode: PageRenderMode;
  zoom: number;
}

interface ContextMenuAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export default React.memo(function PageRenderer({
  page,
  onRenamePage,
  onDeletePage,
  onEditPage,
  onFocusPage,
  onMeasuredHeightChange,
  currentDevice,
  status,
  isOnlyPage,
  isFocused,
  frameHeight,
  renderMode,
  zoom,
}: PageRendererProps) {
  const MAX_IFRAME_HEIGHT = 20000;
  const CHART_CANVAS_HEIGHT = 320;
  const CONTEXT_MENU_WIDTH = 216;
  const CONTEXT_MENU_MARGIN = 12;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const mutationObserverRef = React.useRef<MutationObserver | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const timeoutIdsRef = React.useRef<number[]>([]);
  const imageListenerCleanupRef = React.useRef<(() => void) | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isCodeDialogOpen, setIsCodeDialogOpen] = React.useState(false);
  const [nextPageTitle, setNextPageTitle] = React.useState(page.title);
  const [iframeHeight, setIframeHeight] = React.useState(
    Math.max(currentDevice.height, frameHeight),
  );
  const isLive = renderMode === "live";
  const hasRawHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  const sanitizedHtml = React.useMemo(
    () => (hasRawHtml && isLive ? sanitizeIframeHtml(page.iframeHtml ?? "") : ""),
    [hasRawHtml, isLive, page.iframeHtml],
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
  React.useEffect(() => {
    setNextPageTitle(page.title);
  }, [page.title]);

  React.useEffect(() => {
    setIframeHeight(Math.max(currentDevice.height, frameHeight));
  }, [currentDevice.height, frameHeight]);

  React.useEffect(() => {
    onMeasuredHeightChange?.(page.id, Math.max(currentDevice.height, iframeHeight));
  }, [currentDevice.height, iframeHeight, onMeasuredHeightChange, page.id]);

  const closeContextMenu = React.useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const copyToClipboard = React.useCallback(async (label: string, value: string) => {
    if (!value.trim()) {
      toast.error(`No ${label.toLowerCase()} available to copy.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  }, []);

  const openContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onFocusPage?.(page.id);

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      setContextMenuPosition({
        x: Math.min(
          event.clientX,
          Math.max(CONTEXT_MENU_MARGIN, viewportWidth - CONTEXT_MENU_WIDTH),
        ),
        y: Math.min(event.clientY, Math.max(CONTEXT_MENU_MARGIN, viewportHeight - 260)),
      });
    },
    [onFocusPage, page.id],
  );

  React.useEffect(() => {
    if (!contextMenuPosition) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    const handleViewportChange = () => {
      closeContextMenu();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("contextmenu", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("contextmenu", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeContextMenu, contextMenuPosition]);

  const submitRename = React.useCallback(() => {
    const trimmedTitle = nextPageTitle.trim();
    if (!trimmedTitle) return;

    onRenamePage(page.id, trimmedTitle);
    setIsRenameDialogOpen(false);
  }, [nextPageTitle, onRenamePage, page.id]);

  const slugifiedTitle = React.useMemo(
    () =>
      page.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "page",
    [page.title],
  );

  const exportPageHtml = React.useCallback(() => {
    const html = page.iframeHtml ?? "";
    if (!html.trim()) {
      toast.error("Nothing to export yet for this page.");
      return;
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugifiedTitle}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Page HTML exported.");
  }, [page.iframeHtml, slugifiedTitle]);

  const previewSrcDoc = React.useMemo(
    () =>
      hasRawHtml
        ? stabilizeViewportHeightClasses(
            sanitizeIframeHtml(page.iframeHtml ?? ""),
            currentDevice.height,
          )
        : "",
    [currentDevice.height, hasRawHtml, page.iframeHtml],
  );

  const openToolbarContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onFocusPage?.(page.id);

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      setContextMenuPosition({
        x: Math.min(
          event.clientX,
          Math.max(CONTEXT_MENU_MARGIN, viewportWidth - CONTEXT_MENU_WIDTH),
        ),
        y: Math.min(event.clientY, Math.max(CONTEXT_MENU_MARGIN, viewportHeight - 260)),
      });
    },
    [onFocusPage, page.id],
  );

  const hasPageContent = Boolean(page.iframeHtml?.trim());
  const toolbarScale = Math.max(0.4, Math.min(1.6, 100 / Math.max(20, zoom)));
  const iconButtonClass =
    "flex h-7 w-7 items-center justify-center rounded-md bg-popover text-popover-foreground shadow-md transition hover:bg-accent hover:text-accent-foreground";

  const hoverToolbar = (
    <div
      className={cn(
        "pointer-events-auto ml-auto flex items-center gap-1 rounded-lg border border-border/70 bg-background/80 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover:opacity-100",
        isFocused && "opacity-100",
      )}
      style={{
        transform: `scale(${toolbarScale})`,
        transformOrigin: "right center",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Edit ${page.title}`}
        title="Edit"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onFocusPage?.(page.id);
          onEditPage?.(page.id);
        }}
      >
        <PencilLine className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Preview ${page.title}`}
        title="Preview"
        disabled={!hasPageContent}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setIsPreviewOpen(true);
        }}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`View code for ${page.title}`}
        title="Code"
        disabled={!hasPageContent}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setIsCodeDialogOpen(true);
        }}
      >
        <Code2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`Export ${page.title}`}
        title="Export HTML"
        disabled={!hasPageContent}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          exportPageHtml();
        }}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={iconButtonClass}
        aria-label={`More actions for ${page.title}`}
        title="More"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openToolbarContextMenu}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const statusBadge = (() => {
    if (!status) return null;
    if (status.status === "completed") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          <Check className="h-3 w-3" />
          Done
        </span>
      );
    }
    if (status.status === "failed") {
      return (
        <span
          title={status.detail}
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive"
        >
          <X className="h-3 w-3" />
          Failed
        </span>
      );
    }
    const label =
      status.status === "queued"
        ? "Queued"
        : status.status === "repairing"
          ? "Repairing"
          : "Generating";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {label}
      </span>
    );
  })();

  const contextMenuActions = React.useMemo<ContextMenuAction[]>(
    () => [
      {
        label: "Edit",
        icon: PencilLine,
        onClick: () => {
          onFocusPage?.(page.id);
          onEditPage?.(page.id);
        },
      },
      {
        label: "Rename",
        icon: FileCode2,
        onClick: () => {
          setNextPageTitle(page.title);
          setIsRenameDialogOpen(true);
        },
      },
      {
        label: "Copy HTML",
        icon: Copy,
        onClick: () => {
          void copyToClipboard("Page HTML", page.iframeHtml ?? "");
        },
      },
      {
        label: "Delete",
        icon: Trash2,
        destructive: true,
        disabled: isOnlyPage,
        onClick: () => {
          if (isOnlyPage) return;
          setIsDeleteDialogOpen(true);
        },
      },
    ],
    [
      copyToClipboard,
      isOnlyPage,
      onEditPage,
      onFocusPage,
      page.id,
      page.iframeHtml,
      page.title,
    ],
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
      // Keep responsive chart libraries from entering resize loops.
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
    if (!isLive) return;
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
  }, [disconnectAutoHeightSync, isLive, queueIframeHeightSync]);

  const handleLoad = React.useCallback(() => {
    startAutoHeightSync();
  }, [startAutoHeightSync]);

  React.useEffect(() => {
    if (!isLive) {
      disconnectAutoHeightSync();
      return;
    }

    setIframeHeight(Math.max(currentDevice.height, frameHeight));
    disconnectAutoHeightSync();
    return () => {
      disconnectAutoHeightSync();
    };
  }, [
    currentDevice.height,
    disconnectAutoHeightSync,
    frameHeight,
    isLive,
    page.id,
    page.iframeHtml,
  ]);

  React.useEffect(() => {
    if (!isLive) {
      return;
    }

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
  }, [currentDevice.height, iframeReporterId, isLive]);

  const pageHeight = hasHtml && isLive ? iframeHeight : Math.max(currentDevice.height, frameHeight);

  return (
    <>
      <div
        className="group relative flex flex-col items-center gap-1"
        onContextMenu={openContextMenu}
        onPointerDown={() => onFocusPage?.(page.id)}
      >
        <div className="flex h-[50px] w-full items-center gap-3 px-3 pb-1">
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
          {statusBadge}
          {isLive ? hoverToolbar : null}
        </div>
        <div
          className={cn(
            "relative overflow-hidden rounded-[var(--radius)] border bg-transparent shadow-lg transition-all duration-150",
            isFocused
              ? "border-2 border-sky-500 ring-2 ring-sky-500/20"
              : "border-border group-hover:border-4 group-hover:border-blue-500 group-hover:ring-2 group-hover:ring-blue-500/30",
          )}
          style={{
            width: `${currentDevice.width}px`,
            minHeight: `${currentDevice.height}px`,
            height: `${pageHeight}px`,
          }}
        >
          {hasHtml && isLive ? (
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
          ) : hasRawHtml ? (
            <div className="flex h-full w-full flex-col items-center justify-center bg-background px-8 text-center">
              <p className="text-sm font-medium text-foreground">Preview offscreen</p>
              <p className="mt-2 max-w-[280px] text-xs leading-5 text-muted-foreground">
                This page stays lightweight until it returns to the active viewport.
              </p>
              <div className="mt-5 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {currentDevice.label}
              </div>
            </div>
          ) : (
            <GeneratingPreviewPlaceholder />
          )}
        </div>
      </div>

      {contextMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={contextMenuRef}
              className="fixed z-50 w-[216px] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                left: `${contextMenuPosition.x}px`,
                top: `${contextMenuPosition.y}px`,
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <div className="px-2 py-1.5 text-sm font-medium">{page.title}</div>
              <div className="-mx-1 my-1 h-px bg-border" />
              {contextMenuActions.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors",
                      item.disabled
                        ? "cursor-not-allowed opacity-50"
                        : item.destructive
                          ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                          : "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                    )}
                    disabled={item.disabled}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={() => {
                      item.onClick();
                      closeContextMenu();
                    }}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        item.destructive ? "text-destructive" : "text-muted-foreground",
                      )}
                    />
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

      <Dialog
        open={isRenameDialogOpen}
        onOpenChange={(open) => {
          setIsRenameDialogOpen(open);
          if (open) {
            closeContextMenu();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Page</DialogTitle>
            <DialogDescription>Enter a new name for this page.</DialogDescription>
          </DialogHeader>
          <Input
            value={nextPageTitle}
            onChange={(event) => setNextPageTitle(event.target.value)}
            placeholder="Page title"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitRename();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPreviewOpen}
        onOpenChange={(open) => {
          setIsPreviewOpen(open);
        }}
      >
        <DialogContent
          className="max-w-[calc(100vw-4rem)] p-0"
          style={{ maxWidth: `${Math.min(currentDevice.width + 32, 960)}px` }}
        >
          <DialogHeader className="px-6 pb-2 pt-4">
            <DialogTitle>{page.title}</DialogTitle>
            <DialogDescription>
              Live preview at {currentDevice.label.toLowerCase()} width (
              {currentDevice.width}px). Interactions are enabled inside the
              preview.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(100vh-12rem)] overflow-auto px-6 pb-6">
            <iframe
              title={`${page.title} preview`}
              srcDoc={previewSrcDoc}
              className="w-full rounded-md border border-border bg-background"
              style={{ height: `${Math.max(currentDevice.height, 480)}px` }}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCodeDialogOpen}
        onOpenChange={(open) => {
          setIsCodeDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{page.title} — HTML</DialogTitle>
            <DialogDescription>
              The sanitized HTML currently rendered for this page.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-4 text-foreground/90">
            <code>{page.iframeHtml ?? ""}</code>
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCodeDialogOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                void copyToClipboard("Page HTML", page.iframeHtml ?? "");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy HTML
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsDeleteDialogOpen(open);
          if (open) {
            closeContextMenu();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{page.title}&quot;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeletePage(page.id);
                setIsDeleteDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});
