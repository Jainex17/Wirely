import React from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Check,
  Copy,
  Eye,
  FileCode2,
  FileIcon,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Trash2,
  X,
} from "lucide-react";
import { markAgentCursor } from "@/lib/agentCursor";
import { buildAgentPrompt } from "@/lib/agentPrompt";
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
import type { AgentEdit, PageStatusRecord } from "@/store/useEditorStore";

/** How long the agent cursor stays after the last change it points at. */
const AGENT_CURSOR_LINGER_MS = 3_000;

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

  const script = `<script>(function(){const reporterId=${JSON.stringify(reporterId)};let rafId=0;const measure=()=>{const root=document.documentElement;const body=document.body;if(!root||!body)return;const bodyRect=body.getBoundingClientRect();let maxHeight=Math.max(root.scrollHeight||0,root.offsetHeight||0,root.clientHeight||0,body.scrollHeight||0,body.offsetHeight||0,body.clientHeight||0);const allElements=body.querySelectorAll("*");for(const node of allElements){const element=node;const computed=window.getComputedStyle(element);if(computed.display==="none")continue;const rect=element.getBoundingClientRect();const relativeTop=rect.top-bodyRect.top;const visualBottom=rect.bottom-bodyRect.top;const scrollBottom=relativeTop+Math.max(element.scrollHeight||0,element.clientHeight||0,element.offsetHeight||0);maxHeight=Math.max(maxHeight,visualBottom,scrollBottom);}window.parent.postMessage({type:"wirely-iframe-height",id:reporterId,height:Math.ceil(maxHeight)},"*");const cursorTarget=document.querySelector("[data-wirely-cursor]");if(cursorTarget){const cursorRect=cursorTarget.getBoundingClientRect();window.parent.postMessage({type:"wirely-iframe-cursor",id:reporterId,x:cursorRect.left+window.scrollX,y:cursorRect.top+window.scrollY},"*");}};const queueMeasure=()=>{if(rafId)return;rafId=window.requestAnimationFrame(()=>{rafId=0;measure();});};if(typeof ResizeObserver==="function"){const resizeObserver=new ResizeObserver(queueMeasure);resizeObserver.observe(document.documentElement);resizeObserver.observe(document.body);}if(typeof MutationObserver==="function"){const mutationObserver=new MutationObserver(queueMeasure);mutationObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}window.addEventListener("load",queueMeasure);document.addEventListener("DOMContentLoaded",queueMeasure);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(queueMeasure).catch(()=>{});}window.setTimeout(queueMeasure,40);window.setTimeout(queueMeasure,180);window.setTimeout(queueMeasure,500);window.setTimeout(queueMeasure,1200);queueMeasure();})();</script>`;

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
  /** Present only for saved projects, where the server can render the page. */
  projectId?: string;
  status?: PageStatusRecord | null;
  agentEdit?: AgentEdit | null;
  isOnlyPage: boolean;
  isFocused: boolean;
  /** The user has this page clicked right now, so its size badge shows. */
  isSelected: boolean;
  frameHeight: number;
  renderMode: PageRenderMode;
}

interface ContextMenuAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** Narrowest the preview can be dragged. Below this nothing is readable. */
export const MIN_PREVIEW_WIDTH = 280;

/**
 * Room kept either side of the artboard for the drag handles.
 *
 * They sit outside the frame, so without this the widest preview pushes them
 * past the edge of the scrolling stage and they cannot be grabbed at all.
 */
export const PREVIEW_HANDLE_GUTTER = 40;

/**
 * Width for a drag that started at `startWidth` and has moved `deltaX` so far.
 *
 * Doubled because the artboard is centred: each edge only travels half of what
 * the width changes by, so without it the frame slides behind the cursor. The
 * left grip counts the other way, since moving it left makes the frame wider.
 */
export const resolvePreviewDragWidth = ({
  startWidth,
  deltaX,
  side,
  maxWidth,
}: {
  startWidth: number;
  deltaX: number;
  side: "left" | "right";
  maxWidth: number;
}) =>
  clampPreviewWidth(
    startWidth + deltaX * 2 * (side === "left" ? -1 : 1),
    maxWidth,
  );

/**
 * Clamps a dragged preview width to what the stage can show.
 *
 * The artboard is always drawn at 1:1, so the drag maps exactly to the pointer
 * and the page reflows at its true width. That costs the ability to view a
 * width wider than the dialog, which is the trade for a resize that tracks the
 * cursor instead of sliding against it.
 */
export const clampPreviewWidth = (width: number, stageWidth: number) => {
  const upper = stageWidth > MIN_PREVIEW_WIDTH ? stageWidth : Number.MAX_SAFE_INTEGER;
  return Math.round(Math.min(Math.max(width, MIN_PREVIEW_WIDTH), upper));
};

/**
 * Lets the preview be closed from the keyboard after the pointer has gone into
 * the iframe.
 *
 * The preview deliberately enables interaction, and the moment you click inside
 * a sandboxed frame it owns the keyboard: Escape never reaches the dialog. The
 * frame forwards it back out instead. Posting a message keeps the sandbox as it
 * is, which reaching for `allow-same-origin` would not.
 */
export const injectPreviewEscapeHandler = (html: string, reporterId: string) => {
  if (!html) return html;

  const script = `<script>(function(){const id=${JSON.stringify(reporterId)};document.addEventListener("keydown",function(event){if(event.key==="Escape"){window.parent.postMessage({type:"wirely-preview-escape",id:id},"*");}});})();</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${html}${script}`;
};

export default React.memo(function PageRenderer({
  page,
  onRenamePage,
  onDeletePage,
  onEditPage,
  onFocusPage,
  onMeasuredHeightChange,
  currentDevice,
  projectId,
  status,
  agentEdit = null,
  isOnlyPage,
  isFocused,
  isSelected,
  frameHeight,
  renderMode,
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
  const [previewWidthOverride, setPreviewWidthOverride] = React.useState<
    number | null
  >(null);
  const [isResizingPreview, setIsResizingPreview] = React.useState(false);
  // Code dialog removed from the page toolbar for now.
  // const [isCodeDialogOpen, setIsCodeDialogOpen] = React.useState(false);
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
  // The cursor marker exists only in this srcdoc string. Stored page HTML,
  // exports, and the preview dialog all read page.iframeHtml, which never
  // carries it.
  const cursorEdit = agentEdit && agentEdit.html === page.iframeHtml ? agentEdit : null;
  const markedSrcDoc = React.useMemo(() => {
    if (!hasHtml || !cursorEdit) return { html: canvasSrcDoc, found: false };
    const previousSrcDoc = cursorEdit.previousHtml
      ? stabilizeViewportHeightClasses(
          sanitizeIframeHtml(cursorEdit.previousHtml),
          currentDevice.height,
        )
      : "";
    return markAgentCursor(previousSrcDoc, canvasSrcDoc);
  }, [canvasSrcDoc, currentDevice.height, cursorEdit, hasHtml]);
  const measuredSrcDoc = React.useMemo(
    () =>
      hasHtml ? injectIframeHeightReporter(markedSrcDoc.html, iframeReporterId) : "",
    [hasHtml, iframeReporterId, markedSrcDoc.html],
  );
  const [cursorPoint, setCursorPoint] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [expiredCursorEdit, setExpiredCursorEdit] = React.useState<AgentEdit | null>(null);
  React.useEffect(() => {
    if (!cursorEdit) return;
    // Measured from the edit's own timestamp, so a frame that remounts later
    // does not bring back a cursor for an old change.
    const remaining = AGENT_CURSOR_LINGER_MS - (Date.now() - cursorEdit.at);
    const timeoutId = window.setTimeout(
      () => setExpiredCursorEdit(cursorEdit),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timeoutId);
  }, [cursorEdit]);
  const isPageIdle = status?.status === "completed" || status?.status === "failed";
  const showAgentCursor =
    isLive &&
    markedSrcDoc.found &&
    cursorPoint !== null &&
    cursorEdit !== null &&
    expiredCursorEdit !== cursorEdit &&
    !isPageIdle;
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

  const copyForAgent = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        buildAgentPrompt({
          title: page.title,
          deviceType: page.deviceType === "mobile" ? "mobile" : "desktop",
          html: page.iframeHtml ?? "",
        }),
      );
      toast.success("Copied prompt for your agent");
    } catch {
      toast.error("Could not copy the prompt. Check clipboard permissions and try again.");
    }
  }, [page.deviceType, page.iframeHtml, page.title]);

  const [isCopyingImage, setIsCopyingImage] = React.useState(false);
  const copyImage = React.useCallback(async () => {
    if (!projectId || isCopyingImage) return;
    setIsCopyingImage(true);
    const fetchPng = async () => {
      const response = await fetch(`/api/projects/${projectId}/pages/${page.id}/png`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not render the page image.");
      }
      return response.blob();
    };

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Safari drops the user gesture across an await, so the clipboard
        // write starts now and receives the render as a pending promise.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchPng() })]);
        toast.success("Image copied.");
        return;
      }

      const url = URL.createObjectURL(await fetchPng());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugifiedTitle}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("This browser cannot copy images, so the PNG was downloaded instead.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy the image.");
    } finally {
      setIsCopyingImage(false);
    }
  }, [isCopyingImage, page.id, projectId, slugifiedTitle]);

  const previewSrcDoc = React.useMemo(
    () =>
      hasRawHtml
        ? injectPreviewEscapeHandler(
            stabilizeViewportHeightClasses(
              sanitizeIframeHtml(page.iframeHtml ?? ""),
              currentDevice.height,
            ),
            iframeReporterId,
          )
        : "",
    [currentDevice.height, hasRawHtml, iframeReporterId, page.iframeHtml],
  );

  /**
   * Width of the area the artboard has to live in.
   *
   * The dialog is a fixed stage, so a wider device does not make the window
   * grow. Anything too wide to fit is scaled down instead, the way a design
   * tool fits a frame to the canvas, which keeps the whole width visible rather
   * than hiding half of it behind a horizontal scrollbar.
   */
  // A callback ref, not useRef: the stage lives inside a portal that mounts
  // with the dialog, so a ref read during an effect on `isPreviewOpen` is still
  // null. This fires exactly when the node attaches.
  const [stageEl, setStageEl] = React.useState<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(0);

  React.useEffect(() => {
    if (!stageEl) return;

    // Measured up front rather than waiting on the observer. The stage mounts
    // with the dialog, and the first resize callback does not arrive for a node
    // that appears at its final size, which left the artboard unclamped.
    setStageWidth(stageEl.clientWidth);

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageWidth(entry.contentRect.width);
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  const previewFrameHeight = Math.max(currentDevice.height, 640);
  const previewMaxWidth = Math.max(0, stageWidth - PREVIEW_HANDLE_GUTTER * 2);
  const previewWidth = clampPreviewWidth(
    previewWidthOverride ?? currentDevice.width,
    previewMaxWidth,
  );

  /**
   * Drag-to-resize, the way the browser's own device toolbar works.
   *
   * The move and release listeners go on the window for the length of the drag
   * rather than on the grip. Pointer capture looks like the tidier answer, but
   * it puts the whole gesture at the mercy of one element keeping a capture it
   * can lose, and the preview is a sandboxed iframe sitting directly under the
   * cursor. On the window the drag cannot be stolen. The frame also stops
   * taking pointer events while dragging, so it never swallows a move.
   */
  const releaseResizeRef = React.useRef<(() => void) | null>(null);

  const handleResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = previewWidth;
      const side = event.currentTarget.dataset.side === "left" ? "left" : "right";

      const onMove = (moveEvent: PointerEvent) => {
        setPreviewWidthOverride(
          resolvePreviewDragWidth({
            startWidth,
            deltaX: moveEvent.clientX - startX,
            side,
            maxWidth: previewMaxWidth,
          }),
        );
      };

      const release = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", release);
        window.removeEventListener("pointercancel", release);
        releaseResizeRef.current = null;
        setIsResizingPreview(false);
      };

      releaseResizeRef.current = release;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      setIsResizingPreview(true);
    },
    [previewMaxWidth, previewWidth],
  );

  // Unmounting mid-drag would otherwise leave the listeners on the window.
  React.useEffect(() => () => releaseResizeRef.current?.(), []);

  // Escape forwarded out of the preview frame, since the frame swallows it.
  React.useEffect(() => {
    if (!isPreviewOpen) return;

    const handleEscape = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string } | null;
      if (!data || data.type !== "wirely-preview-escape") return;
      if (data.id !== iframeReporterId) return;
      setIsPreviewOpen(false);
      setPreviewWidthOverride(null);
    };

    window.addEventListener("message", handleEscape);
    return () => window.removeEventListener("message", handleEscape);
  }, [iframeReporterId, isPreviewOpen]);

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
  const iconButtonClass =
    "flex h-7 w-7 items-center justify-center rounded-md bg-popover text-popover-foreground shadow-md transition hover:bg-accent hover:text-accent-foreground";

  const hoverToolbar = (
    <div
      className={cn(
        "pointer-events-auto ml-auto flex items-center gap-1 rounded-lg border border-border/70 bg-background/80 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity duration-150 group-hover:opacity-100",
        isFocused && "opacity-100",
      )}
      style={{
        transform: "scale(clamp(0.4, var(--canvas-inverse-zoom, 1), 1.6))",
        transformOrigin: "right center",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {/* Edit and Code actions hidden for now */}
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
        aria-label="Copy for agent"
        title="Copy for agent"
        disabled={!hasPageContent}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          void copyForAgent();
        }}
      >
        <Bot className="h-3.5 w-3.5" />
      </button>
      {projectId ? (
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Copy image"
          title="Copy image"
          aria-busy={isCopyingImage}
          disabled={!hasPageContent || isCopyingImage}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void copyImage();
          }}
        >
          {isCopyingImage ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </button>
      ) : null}
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
        x?: number;
        y?: number;
      };
      if (payload.id !== iframeReporterId) return;
      if (payload.type === "wirely-iframe-cursor") {
        const { x, y } = payload;
        if (typeof x !== "number" || !Number.isFinite(x)) return;
        if (typeof y !== "number" || !Number.isFinite(y)) return;
        setCursorPoint((previous) =>
          previous && previous.x === x && previous.y === y ? previous : { x, y },
        );
        return;
      }
      if (payload.type !== "wirely-iframe-height") return;
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
            className={cn(
              "flex items-center gap-2 font-medium",
              isFocused
                ? "text-[color:var(--canvas-label-strong,var(--foreground))]"
                : "text-[color:var(--canvas-label,var(--muted-foreground))]",
            )}
            style={{ fontSize: "clamp(12px, calc(12px * var(--canvas-inverse-zoom, 1)), 32px)" }}
          >
            <FileIcon
              className="text-[color:var(--canvas-label,var(--muted-foreground))]"
              style={{
                width: "clamp(12px, calc(14px * var(--canvas-inverse-zoom, 1)), 28px)",
                height: "clamp(12px, calc(14px * var(--canvas-inverse-zoom, 1)), 28px)",
              }}
            />
            {page.title}
          </p>
          {statusBadge}
          {isLive ? hoverToolbar : null}
        </div>
        <div className="relative">
          <div
            className={cn(
              "relative overflow-hidden rounded-[var(--radius)] bg-transparent shadow-lg outline-solid transition-[outline-color] duration-150",
              isFocused ? "outline-sky-500" : "outline-transparent group-hover:outline-sky-500/60",
            )}
            style={{
              // Counter-scaled so the outline stays 1.5 screen pixels at any zoom
              // and never covers the edge of the design.
              outlineWidth: "calc(1.5px * var(--canvas-inverse-zoom, 1))",
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
              // Offscreen, or on screen and waiting its turn to mount.
              <div className="flex h-full w-full flex-col items-center justify-center bg-background px-8 text-center">
                <div className="mt-5 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {currentDevice.label}
                </div>
              </div>
            ) : (
              <GeneratingPreviewPlaceholder />
            )}
          </div>
          {isSelected ? (
            <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center">
              <span
                className="whitespace-nowrap rounded bg-sky-500 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
                style={{
                  marginTop: "calc(8px * var(--canvas-inverse-zoom, 1))",
                  transform: "scale(var(--canvas-inverse-zoom, 1))",
                  transformOrigin: "top center",
                }}
              >
                {currentDevice.width} × {Math.round(pageHeight)}
              </span>
            </div>
          ) : null}
          {showAgentCursor && cursorPoint && cursorEdit ? (
            // Outside the clipped frame so a label near the right edge stays
            // readable. The outer layer slides between targets; the inner one
            // counter-scales with zoom and must not animate, or zooming would lag.
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 z-20 transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: `translate(${cursorPoint.x}px, ${cursorPoint.y}px)` }}
            >
              <div
                className="flex origin-top-left items-start"
                style={{ transform: "scale(var(--canvas-inverse-zoom, 1))" }}
              >
                <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow">
                  <path
                    d="M1 1 L1 17 L5.5 12.5 L8.5 19 L11 18 L8 11.5 L14.5 11.5 Z"
                    fill="#f97316"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="mt-3 whitespace-nowrap rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-medium text-white shadow">
                  {cursorEdit.label}
                </span>
              </div>
            </div>
          ) : null}
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
          if (!open) {
            setPreviewWidthOverride(null);
          }
        }}
      >
        {/*
          A fixed stage. The dialog keeps its size whatever width is picked, and
          the artboard scales to fit inside it, so choosing a width moves the
          page being designed rather than the window around it. Pinned to the
          top because a dialog centred on its own height hangs off both ends of
          a laptop screen and puts its own controls out of reach.
        */}
        <DialogContent
          showCloseButton={false}
          className="top-8 flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-6 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-medium leading-6">
                {page.title}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5 text-muted-foreground">
                Drag the edge to resize. Press Escape to close.
              </DialogDescription>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {/* The live width, in the same spot whether or not you are
                  dragging, so the number never jumps around mid-drag. */}
              <span className="rounded-md bg-muted/60 px-2 py-1 text-xs tabular-nums text-muted-foreground">
                {previewWidth} x {previewFrameHeight}
              </span>
              {/* A plain button writing state directly, not DialogClose: after
                  clicking inside the preview frame, Radix's focus bookkeeping
                  has already eaten close clicks once, and the controlled state
                  is the source of truth anyway. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Close preview"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
                onClick={() => {
                  setIsPreviewOpen(false);
                  setPreviewWidthOverride(null);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* The artboard sits on a recessed surface so it reads as an object
              on a canvas, not as more dialog. */}
          <div
            ref={setStageEl}
            className="flex min-h-0 flex-1 overflow-auto bg-muted/40 py-6"
          >
            {/* `m-auto` inside a flex container, not `justify-center`: centring
                via justify-content clips the overflowing edge once the artboard
                is taller than the stage, and auto margins do not. */}
            <div
              className="relative m-auto shrink-0"
              style={{
                width: `${previewWidth}px`,
                height: `${previewFrameHeight}px`,
              }}
            >
              <iframe
                title={`${page.title} preview`}
                srcDoc={previewSrcDoc}
                className={cn(
                  "block size-full rounded-lg border border-border bg-background shadow-sm",
                  // The frame must not eat the pointer mid-drag.
                  isResizingPreview && "pointer-events-none select-none",
                )}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />

              {(["left", "right"] as const).map((side) => (
                <div
                  key={side}
                  data-side={side}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize preview from the ${side}`}
                  onPointerDown={handleResizeStart}
                  className={cn(
                    "group absolute inset-y-0 flex w-8 cursor-ew-resize touch-none select-none items-center justify-center",
                    side === "left" ? "-left-8" : "-right-8",
                  )}
                >
                  <span
                    className={cn(
                      "h-16 w-1.5 rounded-full transition-colors",
                      isResizingPreview
                        ? "bg-foreground/70"
                        : "bg-muted-foreground/40 group-hover:bg-foreground/60",
                    )}
                  />
                </div>
              ))}

              {/* The width follows the frame during a drag, so the number is
                  where the eye already is rather than up in the header. */}
              {isResizingPreview ? (
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium tabular-nums text-background">
                  {previewWidth}px
                </span>
              ) : null}
            </div>
          </div>
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
