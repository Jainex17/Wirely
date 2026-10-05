import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileIcon,
  FileText,
  History,
  MessageSquarePlus,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { AGENT_CURSOR_ATTRIBUTE, buildRevealSteps, markAgentCursor } from "@/lib/agentCursor";
import { buildAgentPrompt, stripWirelyArtifacts } from "@/lib/agentPrompt";
import { sanitizeIframeHtml } from "@/lib/iframeSecurity";
import { injectIframeHeightReporter } from "@/lib/frameHeightReporter";
import { FRAME_MOTION_REPLAY, injectFrameMotion } from "@/lib/frameMotion";
import { hasPageMotion } from "@/lib/inertCss";
import {
  injectNodePicker,
  NODE_EDIT_REQUEST_EVENT,
  NODE_PREVIEW_EVENT,
  parseReportedNode,
  previewNode,
  type NodePreview,
  type NodeReportIntent,
  type ReportedNode,
} from "@/lib/nodePicker";
import {
  getNodeText,
  type NodeStyleProperty,
  setNodeStyle,
  setNodeText,
  stampNodeIds,
} from "@/lib/pageNodes";
import type { InsertKind } from "@/lib/pageTree";
import { commitPageEdit, dropElement, insertAsset } from "@/store/pageEdits";
import { registerCanvasFrame, useDropIndicator } from "@/store/canvasDrop";
import { ASSET_DRAG_TYPE, type DraggedAsset, parseAssetDrag } from "@/lib/assetDrag";
import { measureBetween } from "@/lib/elementMeasure";
import ElementEditLayer from "./ElementEditLayer";
import { hasTailwindRuntime, precompileFrameHtml } from "@/lib/tailwindFrameBrowser";
import {
  applyInertPreview,
  findInertNode,
  type InertFrame as InertFrameHandle,
  inertElementBox,
  inertNodeAt,
  reportInertNode,
} from "@/lib/inertPicker";
import InertFrame from "./InertFrame";
import { exportArtboardSvg } from "@/lib/vectorArtboard";
import VectorEditLayer from "./VectorEditLayer";
import GeneratingPreviewPlaceholder from "./GeneratingPreviewPlaceholder";
import PageHistoryDialog from "./PageHistoryDialog";
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
import type { PageDeviceType } from "@/lib/types";
import { type AgentEdit, type PageStatusRecord, useEditorStore } from "@/store/useEditorStore";
import { MAX_COMMENT_CHARS, type ProjectComment } from "@/lib/projectComments";

/** How long the agent cursor stays after the last change it points at. */
const AGENT_CURSOR_LINGER_MS = 3_000;
// A drop line's thickness, 2 screen px at any zoom.
const DROP_LINE = "calc(2px * var(--canvas-inverse-zoom, 1))";
// Each replay step reloads the frame, so steps come no faster than the frame
// can repaint without flashing. Ten steps cap a replay near three seconds.
const REVEAL_STEP_MS = 300;
// How long keys stay blocked waiting for the live frame to start a text edit.
const PENDING_EDIT_TIMEOUT_MS = 10_000;
/** Where the design starts below the frame's top: the 50px title row plus the 4px column gap. */
export const PAGE_FRAME_TOP = 54;

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
    deviceType?: PageDeviceType;
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
  /**
   * Swaps this page to its live frame, the one page on the canvas that runs
   * scripts, or with null sends it back to inert.
   */
  onLiveChange?: (pageId: string | null) => void;
  /** The element tool is active, so pointer moves and clicks pick elements in this page. */
  isElementMode: boolean;
  /** The pen tool is active. */
  isPenMode: boolean;
  /** The comment tool is active, so a click opens a comment on the element under it. */
  isCommentMode: boolean;
  /** Saves an edit made on the canvas, such as a moved path point. */
  onSavePageHtml?: (pageId: string, html: string) => void;
  /**
   * The move tool is active. A press still drags the page, and a click that
   * does not move picks the element under it, so the user can select without
   * switching tools.
   */
  isMoveMode: boolean;
  /** The picked element when it is on this page. */
  selectedNodeId: string | null;
  onNodeReport?: (pageId: string, node: ReportedNode, intent: "pick" | "select") => void;
  /** An insert tool is active, so a click adds this kind of element where it lands. */
  insertKind: InsertKind | null;
  onInsertAt?: (pageId: string, node: ReportedNode) => void;
}

interface ContextMenuAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Narrowest the preview can be dragged. Below this nothing is readable. */
export const MIN_PREVIEW_WIDTH = 280;

/** Common breakpoints, for checking a page reflows at each one. */
const PREVIEW_BREAKPOINTS = [
  { label: "Mobile", width: 375 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 1440 },
] as const;

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
  onLiveChange,
  isElementMode,
  isPenMode,
  isCommentMode,
  onSavePageHtml,
  isMoveMode,
  selectedNodeId,
  onNodeReport,
  insertKind,
  onInsertAt,
}: PageRendererProps) {
  const MAX_IFRAME_HEIGHT = 20000;
  const CONTEXT_MENU_WIDTH = 216;
  const CONTEXT_MENU_MARGIN = 12;
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  /** Where in page coordinates the context menu was opened. */
  const [contextMenuPagePoint, setContextMenuPagePoint] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  // A comment pins where the user clicked or right-clicked, and to the
  // element there when the comment tool picked one.
  const [commentDraft, setCommentDraft] = React.useState<{
    x: number;
    y: number;
    nodeId: string | null;
    body: string;
  } | null>(null);
  const [isPostingComment, setIsPostingComment] = React.useState(false);

  const postComment = async () => {
    const body = commentDraft?.body.trim();
    if (!projectId || !body || isPostingComment) return;
    setIsPostingComment(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: page.id,
          nodeId: commentDraft!.nodeId,
          body,
          x: Math.max(0, Math.round(commentDraft!.x)),
          y: Math.max(0, Math.round(commentDraft!.y)),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { comment?: ProjectComment; error?: string }
        | null;
      if (!response.ok || !payload?.comment) {
        throw new Error(payload?.error || "Could not add the comment.");
      }
      const { comments, setComments } = useEditorStore.getState();
      setComments([...comments, payload.comment]);
      setCommentDraft(null);
      toast.success("Comment added. Ask your agent to address the comments on this project.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the comment.");
    } finally {
      setIsPostingComment(false);
    }
  };
  const [previewWidthOverride, setPreviewWidthOverride] = React.useState<
    number | null
  >(null);

  // A click anywhere outside the comment popup discards the draft, the same
  // way the comment cards close.
  const commentDraftRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!commentDraft) return;
    const close = (event: PointerEvent) => {
      if (!commentDraftRef.current?.contains(event.target as Node)) setCommentDraft(null);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [commentDraft]);
  const [isResizingPreview, setIsResizingPreview] = React.useState(false);
  // Code dialog removed from the page toolbar for now.
  // const [isCodeDialogOpen, setIsCodeDialogOpen] = React.useState(false);
  const [nextPageTitle, setNextPageTitle] = React.useState(page.title);
  // The page's full height, reported by the live frame or measured in the inert one.
  const [contentHeight, setContentHeight] = React.useState(
    Math.max(currentDevice.height, frameHeight),
  );
  // The element whose text the user is typing into, in the live frame. A page
  // stays live until typing ends, so leaving it never drops the text.
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const isLive = renderMode === "live" || editingNodeId !== null;
  const [hasLiveLoaded, setHasLiveLoaded] = React.useState(false);
  if (!isLive && hasLiveLoaded) setHasLiveLoaded(false);
  // Until the live frame loads, the inert frame under it answers the element tool.
  const isLiveReady = isLive && hasLiveLoaded;
  const hasRawHtml =
    typeof page.iframeHtml === "string" && page.iframeHtml.trim().length > 0;
  // The cursor marker exists only in the srcdoc string. Stored page HTML,
  // exports, and the preview dialog all read page.iframeHtml, which never
  // carries it or a replay step.
  const cursorEdit = agentEdit && agentEdit.html === page.iframeHtml ? agentEdit : null;
  const replayEdit = cursorEdit?.replay ? cursorEdit : null;
  const revealSteps = React.useMemo(
    () => (replayEdit ? buildRevealSteps(replayEdit.previousHtml, replayEdit.html) : []),
    [replayEdit],
  );
  const replayMs = Math.max(0, revealSteps.length - 1) * REVEAL_STEP_MS;
  // Derived from the edit's timestamp, so a frame that mounts mid-replay picks
  // up where it should be and one that mounts later shows the finished page.
  const [revealNow, setRevealNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!replayEdit || replayMs === 0) return;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setRevealNow(now);
      if (now >= replayEdit.at + replayMs) window.clearInterval(intervalId);
    }, REVEAL_STEP_MS);
    return () => window.clearInterval(intervalId);
  }, [replayEdit, replayMs]);
  const revealIndex =
    replayEdit && revealSteps.length > 1
      ? Math.min(
          revealSteps.length - 1,
          Math.max(0, Math.floor((revealNow - replayEdit.at) / REVEAL_STEP_MS)),
        )
      : -1;
  const displayedHtml = revealIndex >= 0 ? revealSteps[revealIndex] : (page.iframeHtml ?? "");
  const cursorPreviousHtml =
    revealIndex > 0 ? revealSteps[revealIndex - 1] : (cursorEdit?.previousHtml ?? "");
  // Stamped before sanitizing, so the ids match the ones the editor saves
  // when an element is picked, even where the sanitizer drops elements.
  const sanitizedHtml = React.useMemo(
    () => (hasRawHtml ? sanitizeIframeHtml(stampNodeIds(displayedHtml)) : ""),
    [displayedHtml, hasRawHtml],
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
  const markedSrcDoc = React.useMemo(() => {
    if (!hasHtml || !cursorEdit) return { html: canvasSrcDoc, found: false };
    const previousSrcDoc = cursorPreviousHtml
      ? stabilizeViewportHeightClasses(
          sanitizeIframeHtml(stampNodeIds(cursorPreviousHtml)),
          currentDevice.height,
        )
      : "";
    return markAgentCursor(previousSrcDoc, canvasSrcDoc);
  }, [canvasSrcDoc, currentDevice.height, cursorEdit, cursorPreviousHtml, hasHtml]);
  // The page with its Tailwind compiled in the editor, so the frame loads
  // plain CSS instead of running the compiler itself. The last compiled page
  // stays up while the next one compiles, so an edit reloads the frame once.
  const [compiledFrame, setCompiledFrame] = React.useState<{
    html: string;
    reporterId: string;
  } | null>(null);
  // A page that leaves live drops its compiled frame, so going live again
  // after an agent edit does not load the old page first and then reload.
  // The compile cache makes an unchanged page come back within a tick.
  if (!isLive && compiledFrame) setCompiledFrame(null);
  React.useEffect(() => {
    if (!hasHtml || !isLive) return;
    let isCurrent = true;
    const reporterId = iframeReporterId;
    void precompileFrameHtml(markedSrcDoc.html).then((html) => {
      if (isCurrent) setCompiledFrame({ html, reporterId });
    });
    return () => {
      isCurrent = false;
    };
  }, [hasHtml, iframeReporterId, isLive, markedSrcDoc.html]);
  // Every page renders inert from the same compiled HTML the live frame loads,
  // so going live finds it in the compile cache. The inert frame stays under
  // the live one until it loads, so the swap never shows a blank frame. Inert
  // compiles, agent reveal steps included, wait behind the live page's, so a
  // busy canvas never delays the page the user is working on. A regenerating
  // page clears its HTML, and a failed compile leaves the Tailwind runtime an
  // inert frame cannot run; both show the placeholder, which offers live.
  const isRevealStep = revealIndex >= 0 && revealIndex < revealSteps.length - 1;
  const [inertHtml, setInertHtml] = React.useState<string | null>(null);
  const [hasInertFailed, setHasInertFailed] = React.useState(false);
  if (!hasHtml && (inertHtml || hasInertFailed)) {
    setInertHtml(null);
    setHasInertFailed(false);
  }
  React.useEffect(() => {
    if (!hasHtml) return;
    let isCurrent = true;
    // A reveal step before the last is shown once, so it stays out of the cache.
    void precompileFrameHtml(markedSrcDoc.html, { background: true, isTransient: isRevealStep }).then((html) => {
      if (!isCurrent) return;
      const failed = hasTailwindRuntime(html);
      setInertHtml(failed ? null : html);
      setHasInertFailed(failed);
    });
    return () => {
      isCurrent = false;
    };
  }, [hasHtml, isRevealStep, markedSrcDoc.html]);
  const [inertFrame, setInertFrame] = React.useState<InertFrameHandle | null>(null);
  // Lets an element dragged from any page find a drop on this one.
  React.useEffect(() => {
    if (!inertFrame) return;
    registerCanvasFrame(page.id, { frame: inertFrame, isVector: page.deviceType === "vector" });
    return () => registerCanvasFrame(page.id, null);
  }, [inertFrame, page.deviceType, page.id]);
  const dropIndicator = useDropIndicator((state) =>
    state.drop?.pageId === page.id ? state.drop.indicator : null,
  );
  const measuredSrcDoc = React.useMemo(
    () =>
      hasHtml && compiledFrame
        ? injectFrameMotion(
            injectNodePicker(
              injectIframeHeightReporter(compiledFrame.html, compiledFrame.reporterId),
              compiledFrame.reporterId,
            ),
            compiledFrame.reporterId,
          )
        : "",
    [compiledFrame, hasHtml],
  );
  const [cursorPoint, setCursorPoint] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  // Replay shows when the compiled page has keyframes something uses. An inert
  // page goes live to play them.
  const motionHtml = inertHtml ?? compiledFrame?.html ?? null;
  const hasMotion = React.useMemo(() => motionHtml !== null && hasPageMotion(motionHtml), [motionHtml]);
  const replayOnLoadRef = React.useRef(false);
  const [expiredCursorEdit, setExpiredCursorEdit] = React.useState<AgentEdit | null>(null);
  React.useEffect(() => {
    if (!cursorEdit) return;
    // Measured from the edit's own timestamp, so a frame that remounts later
    // does not bring back a cursor for an old change.
    const remaining = AGENT_CURSOR_LINGER_MS + replayMs - (Date.now() - cursorEdit.at);
    const timeoutId = window.setTimeout(
      () => setExpiredCursorEdit(cursorEdit),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timeoutId);
  }, [cursorEdit, replayMs]);
  const isPageIdle = status?.status === "completed" || status?.status === "failed";
  const showAgentCursor =
    (isLive || inertFrame !== null) &&
    markedSrcDoc.found &&
    cursorPoint !== null &&
    cursorEdit !== null &&
    expiredCursorEdit !== cursorEdit &&
    !isPageIdle;
  React.useEffect(() => {
    setNextPageTitle(page.title);
  }, [page.title]);

  const pageHeight = hasHtml ? contentHeight : Math.max(currentDevice.height, frameHeight);

  React.useEffect(() => {
    onMeasuredHeightChange?.(page.id, Math.max(currentDevice.height, contentHeight));
  }, [currentDevice.height, contentHeight, onMeasuredHeightChange, page.id]);

  // The live frame reports its own height, and the hidden inert one must not
  // fight it.
  const handleInertHeight = React.useCallback(
    (height: number) => {
      if (isLiveReady) return;
      const bounded = Math.min(MAX_IFRAME_HEIGHT, Math.max(currentDevice.height, Math.ceil(height)));
      setContentHeight((previous) => (previous === bounded ? previous : bounded));
    },
    [currentDevice.height, isLiveReady],
  );

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

      // The same spot in page coordinates, so Add comment can pin there. The
      // frame is scaled with the canvas; the page works in its own px.
      const frame = frameRef.current;
      if (frame) {
        const rect = frame.getBoundingClientRect();
        const ratio = rect.width > 0 ? currentDevice.width / rect.width : 1;
        setContextMenuPagePoint({
          x: Math.min(Math.max((event.clientX - rect.left) * ratio, 0), currentDevice.width),
          y: Math.min(Math.max((event.clientY - rect.top) * ratio, 0), pageHeight),
        });
      }
    },
    [onFocusPage, page.id, currentDevice.width, pageHeight],
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

    // Capture phase on pointerdown: the canvas prevents default on pointerdown,
    // which suppresses mousedown, and stops propagation before document.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("contextmenu", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("contextmenu", handlePointerDown, true);
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
    if (!projectId) return;
    const buildPrompt = async () => {
      const response = await fetch(`/api/projects/${projectId}/pages/${page.id}/share`, {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; expiresAt?: number; error?: string }
        | null;
      if (!response.ok || !payload?.url || !payload.expiresAt) {
        throw new Error(payload?.error || "Could not create a share link.");
      }
      return buildAgentPrompt({
        title: page.title,
        deviceType: page.deviceType ?? "desktop",
        shareUrl: payload.url,
        expiresAt: payload.expiresAt,
      });
    };

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Safari drops the user gesture across an await, so the clipboard
        // write starts now and receives the prompt as a pending promise.
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": buildPrompt().then((prompt) => new Blob([prompt], { type: "text/plain" })),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await buildPrompt());
      }
      toast.success("Copied prompt with a share link for your agent");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not copy the prompt. Check clipboard permissions and try again.",
      );
    }
  }, [page.deviceType, page.id, page.title, projectId]);

  /** A server render of the saved page: a PNG at 1x by default, `scale=2`, or `format=pdf`. */
  const fetchPageRender = React.useCallback(
    async (query = "") => {
      const response = await fetch(
        `/api/projects/${projectId}/pages/${page.id}/png${query ? `?${query}` : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Could not render the page image.");
      }
      return response.blob();
    },
    [page.id, projectId],
  );

  const [isCopyingImage, setIsCopyingImage] = React.useState(false);
  const copyImage = React.useCallback(async () => {
    if (!projectId || isCopyingImage) return;
    setIsCopyingImage(true);
    const fetchPng = () => fetchPageRender();

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Safari drops the user gesture across an await, so the clipboard
        // write starts now and receives the render as a pending promise.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchPng() })]);
        toast.success("Image copied.");
        return;
      }

      downloadBlob(await fetchPng(), `${slugifiedTitle}.png`);
      toast.success("This browser cannot copy images, so the PNG was downloaded instead.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy the image.");
    } finally {
      setIsCopyingImage(false);
    }
  }, [fetchPageRender, isCopyingImage, projectId, slugifiedTitle]);

  const downloadRender = React.useCallback(
    async (kind: "2x" | "3x" | "pdf") => {
      const isPdf = kind === "pdf";
      const pending = toast.loading(isPdf ? "Rendering a PDF…" : `Rendering a ${kind} PNG…`);
      try {
        const blob = await fetchPageRender(isPdf ? "format=pdf" : `scale=${kind[0]}`);
        downloadBlob(blob, isPdf ? `${slugifiedTitle}.pdf` : `${slugifiedTitle}@${kind}.png`);
        toast.success(isPdf ? "PDF downloaded." : "PNG downloaded.", { id: pending });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not render the page.", {
          id: pending,
        });
      }
    },
    [fetchPageRender, slugifiedTitle],
  );

  // Built only while the preview is open, so opening the editor does not
  // sanitize every page a second time.
  const previewSrcDoc = React.useMemo(
    () =>
      hasRawHtml && isPreviewOpen
        ? injectPreviewEscapeHandler(
            stabilizeViewportHeightClasses(
              sanitizeIframeHtml(page.iframeHtml ?? ""),
              currentDevice.height,
            ),
            iframeReporterId,
          )
        : "",
    [currentDevice.height, hasRawHtml, iframeReporterId, isPreviewOpen, page.iframeHtml],
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
      {hasMotion ? (
        <button
          type="button"
          className={iconButtonClass}
          aria-label={`Replay animations on ${page.title}`}
          title="Replay animations"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (!isLiveReady) {
              replayOnLoadRef.current = true;
              onLiveChange?.(page.id);
              return;
            }
            // A sandboxed frame has an opaque origin, so "*" is the only
            // target that reaches it. The message carries nothing secret.
            iframeRef.current?.contentWindow?.postMessage({ type: FRAME_MOTION_REPLAY }, "*");
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
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
          void copyToClipboard("Page HTML", stripWirelyArtifacts(page.iframeHtml ?? ""));
        },
      },
      ...(page.deviceType === "vector"
        ? [
            {
              label: "Copy SVG",
              icon: Copy,
              onClick: () => {
                void copyToClipboard("SVG", exportArtboardSvg(page.iframeHtml ?? "") ?? "");
              },
            },
          ]
        : []),
      {
        label: "Download HTML",
        icon: Download,
        onClick: () => {
          const html = stripWirelyArtifacts(page.iframeHtml ?? "");
          if (!html.trim()) {
            toast.error("This page has no design yet.");
            return;
          }
          downloadBlob(new Blob([html], { type: "text/html" }), `${slugifiedTitle}.html`);
        },
      },
      ...(projectId
        ? [
            {
              label: "Download PNG 2x",
              icon: ImageIcon,
              onClick: () => void downloadRender("2x"),
            },
            {
              label: "Download PNG 3x",
              icon: ImageIcon,
              onClick: () => void downloadRender("3x"),
            },
            {
              label: "Download PDF",
              icon: FileText,
              onClick: () => void downloadRender("pdf"),
            },
            {
              label: "History",
              icon: History,
              onClick: () => setIsHistoryOpen(true),
            },
            {
              label: "Add comment",
              icon: MessageSquarePlus,
              onClick: () => {
                const point = contextMenuPagePoint ?? { x: 24, y: 24 };
                setCommentDraft({ x: point.x, y: point.y, nodeId: null, body: "" });
              },
            },
          ]
        : []),
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
      downloadRender,
      isOnlyPage,
      onEditPage,
      onFocusPage,
      contextMenuPagePoint,
      page.deviceType,
      page.id,
      page.iframeHtml,
      page.title,
      projectId,
      slugifiedTitle,
    ],
  );

  const [hoverBox, setHoverBox] = React.useState<ReportedNode | null>(null);
  const [selectedBox, setSelectedBox] = React.useState<ReportedNode | null>(null);
  const hoverPointRef = React.useRef<{ x: number; y: number } | null>(null);
  // Set when this frame sent a click, so a page's own script cannot post a
  // pick and change the selection on its own.
  const isPickPendingRef = React.useRef(false);
  const hoverFrameRef = React.useRef(0);

  // Frame reports go through this ref, so an inert frame's answer reaches the
  // same handler a live frame's message does.
  const handleFrameDataRef = React.useRef<(data: unknown) => void>(() => {});
  const postToFrame = React.useCallback(
    (message: Record<string, unknown>) => {
      if (isLiveReady) {
        // A sandboxed frame has an opaque origin, so "*" is the only target
        // that reaches it. Nothing sent here is secret.
        iframeRef.current?.contentWindow?.postMessage(message, "*");
        return;
      }
      if (!inertFrame) return;
      const report = (intent: NodeReportIntent, element: Element | null) =>
        handleFrameDataRef.current({
          type: "wirely-node",
          intent,
          node: reportInertNode(inertFrame, element, intent),
        });
      if (message.type === "wirely-node-at" && typeof message.x === "number" && typeof message.y === "number") {
        report(message.intent === "hover" ? "hover" : "pick", inertNodeAt(inertFrame, message.x, message.y));
      } else if (message.type === "wirely-node-find") {
        report("select", findInertNode(inertFrame, message.nodeId));
      } else if (message.type === "wirely-node-preview") {
        const element = findInertNode(inertFrame, message.nodeId);
        if (!element) return;
        applyInertPreview(element, message, inertFrame.viewport);
        report("select", element);
      }
    },
    [inertFrame, isLiveReady],
  );

  const findSelectedNode = React.useCallback(() => {
    if (selectedNodeId) postToFrame({ type: "wirely-node-find", nodeId: selectedNodeId });
  }, [postToFrame, selectedNodeId]);

  // Set when an insert click is waiting for the frame to say what it hit.
  const isInsertPendingRef = React.useRef(false);
  // A project image dropped on the page, while the frame finds the element under it.
  const pendingAssetRef = React.useRef<DraggedAsset | null>(null);
  // Where a comment tool click landed, while the frame finds the element there.
  const commentPointRef = React.useRef<{ x: number; y: number } | null>(null);
  // An element to start typing into once the live frame reports it, after a
  // double click on an inert page or an insert. The ref is what frame reports
  // read; the state blocks keys and shows the wait.
  const pendingEditRef = React.useRef<string | null>(null);
  const [pendingEditId, setPendingEditId] = React.useState<string | null>(null);
  const setPendingEdit = React.useCallback((nodeId: string | null) => {
    pendingEditRef.current = nodeId;
    setPendingEditId(nodeId);
  }, []);
  // The page HTML when typing began. Text typed into a page that changed
  // since, by an agent or a poll, is dropped rather than written over it.
  const editStartHtmlRef = React.useRef<string | null>(null);

  /** Types into a text-only element in place. False when it holds other elements. */
  const startTextEdit = React.useCallback(
    (nodeId: string) => {
      if (getNodeText(stampNodeIds(page.iframeHtml ?? ""), nodeId) === null) return false;
      if (!isLiveReady) {
        // Typing happens in the live frame, which starts once it loads and
        // reports the element.
        setPendingEdit(nodeId);
        onLiveChange?.(page.id);
        return true;
      }
      setEditingNodeId(nodeId);
      editStartHtmlRef.current = page.iframeHtml ?? "";
      iframeRef.current?.focus();
      postToFrame({ type: "wirely-node-edit", nodeId });
      return true;
    },
    [isLiveReady, onLiveChange, page.id, page.iframeHtml, postToFrame, setPendingEdit],
  );

  React.useEffect(() => {
    const handleRequest = (event: Event) => {
      const { pageId, nodeId } = (event as CustomEvent<{ pageId: string; nodeId: string }>).detail;
      if (pageId !== page.id) return;
      // Live at once: the live frame compiles ahead of every inert page, so
      // the new element is ready to type into sooner than an inert rebuild.
      setPendingEdit(nodeId);
      onLiveChange?.(page.id);
    };
    window.addEventListener(NODE_EDIT_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(NODE_EDIT_REQUEST_EVENT, handleRequest);
  }, [onLiveChange, page.id, setPendingEdit]);

  // Until typing starts in the live frame, keys would reach the editor's
  // shortcuts, where Backspace deletes the element about to be edited. Escape
  // gives up the wait, and so does a frame that never reports the element.
  React.useEffect(() => {
    if (!pendingEditId) return;
    const block = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingEdit(null);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const timeoutId = window.setTimeout(() => setPendingEdit(null), PENDING_EDIT_TIMEOUT_MS);
    window.addEventListener("keydown", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.clearTimeout(timeoutId);
    };
  }, [pendingEditId, setPendingEdit]);

  // A page that leaves live drops the Replay or edit that was waiting on its
  // frame.
  const wasLiveRef = React.useRef(isLive);
  React.useEffect(() => {
    if (wasLiveRef.current && !isLive) {
      replayOnLoadRef.current = false;
      setPendingEdit(null);
    }
    wasLiveRef.current = isLive;
  }, [isLive, setPendingEdit]);

  const toPagePoint = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = frameRef.current?.getBoundingClientRect();
      const ratio = rect && rect.width > 0 ? currentDevice.width / rect.width : 1;
      return {
        x: (clientX - (rect?.left ?? 0)) * ratio,
        y: (clientY - (rect?.top ?? 0)) * ratio,
      };
    },
    [currentDevice.width],
  );

  // Re-measured when the page grows, since images and fonts move elements, and
  // whenever a frame mounts or the page swaps between inert and live.
  React.useEffect(() => {
    if (isLive || inertFrame) findSelectedNode();
  }, [contentHeight, findSelectedNode, inertFrame, isLive]);

  // An inert frame has no reporter, so the agent cursor is measured here.
  React.useEffect(() => {
    if (!inertFrame || isLiveReady) return;
    const box = inertElementBox(inertFrame, inertFrame.root.querySelector(`[${AGENT_CURSOR_ATTRIBUTE}]`));
    if (box) setCursorPoint({ x: box.x, y: box.y });
    // Measured again as images and fonts grow the page and move the element.
  }, [contentHeight, inertFrame, isLiveReady]);

  // Leaving the page while typing blurs the live frame, which saves the text
  // and ends the edit, and only then lets the page go inert.
  React.useEffect(() => {
    if (renderMode === "live" || !editingNodeId) return;
    iframeRef.current?.blur();
    window.focus();
  }, [editingNodeId, renderMode]);

  React.useEffect(() => () => window.cancelAnimationFrame(hoverFrameRef.current), []);

  // Holding Alt with an element picked measures from it to the hovered one.
  const [isAltHeld, setIsAltHeld] = React.useState(false);
  const canMeasure = (isLive || inertFrame !== null) && (isElementMode || isMoveMode) && selectedBox !== null;
  React.useEffect(() => {
    if (!canMeasure) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;
      // Keeps Windows browsers from moving focus to their menu bar.
      event.preventDefault();
      setIsAltHeld(event.type === "keydown");
    };
    const release = () => setIsAltHeld(false);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
      window.removeEventListener("blur", release);
      release();
    };
  }, [canMeasure]);

  const toFramePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    // The frame is scaled with the canvas; the page inside works in its own px.
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? currentDevice.width / rect.width : 1;
    return {
      x: (event.clientX - rect.left) * ratio,
      y: (event.clientY - rect.top) * ratio,
    };
  };

  const sendPointToFrame = (
    event: React.PointerEvent<HTMLDivElement>,
    intent: Exclude<NodeReportIntent, "select">,
  ) => {
    const point = toFramePoint(event);
    if (intent === "pick") {
      isPickPendingRef.current = true;
      postToFrame({ type: "wirely-node-at", intent, ...point });
      return;
    }
    hoverPointRef.current = point;
    if (hoverFrameRef.current) return;
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = 0;
      if (hoverPointRef.current) {
        postToFrame({ type: "wirely-node-at", intent: "hover", ...hoverPointRef.current });
      }
    });
  };

  React.useEffect(() => {
    const handlePreview = (event: Event) => {
      const { detail } = event as CustomEvent<NodePreview>;
      if (detail.pageId !== page.id) return;
      postToFrame({ ...detail, type: "wirely-node-preview" });
    };
    window.addEventListener(NODE_PREVIEW_EVENT, handlePreview);
    return () => window.removeEventListener(NODE_PREVIEW_EVENT, handlePreview);
  }, [page.id, postToFrame]);

  const handleLoad = React.useCallback(() => {
    setHasLiveLoaded(true);
    if (replayOnLoadRef.current) {
      replayOnLoadRef.current = false;
      iframeRef.current?.contentWindow?.postMessage({ type: FRAME_MOTION_REPLAY }, "*");
    }
    // A reload drops any click the old document was answering, and any typing.
    isPickPendingRef.current = false;
    isInsertPendingRef.current = false;
    pendingAssetRef.current = null;
    commentPointRef.current = null;
    setEditingNodeId(null);
    // Straight to the frame that just loaded: postToFrame from this render may
    // still point at the inert frame.
    if (selectedNodeId) {
      iframeRef.current?.contentWindow?.postMessage({ type: "wirely-node-find", nodeId: selectedNodeId }, "*");
    }
  }, [selectedNodeId]);

  React.useEffect(() => {
    setContentHeight(Math.max(currentDevice.height, frameHeight));
  }, [currentDevice.height, frameHeight, page.id, page.iframeHtml]);

  const handleFrameData = React.useCallback(
    (data: unknown) => {
      if (!data || typeof data !== "object") return;

      const payload = data as {
        type?: string;
        height?: number;
        x?: number;
        y?: number;
      };
      if (payload.type === "wirely-node") {
        const { intent, node: rawNode } = data as { intent?: unknown; node?: unknown };
        const node = parseReportedNode(rawNode);
        if (intent === "hover") {
          setHoverBox(node);
        } else if (intent === "pick" && pendingAssetRef.current) {
          const asset = pendingAssetRef.current;
          pendingAssetRef.current = null;
          if (projectId) insertAsset(projectId, page.id, asset, node ?? "end");
        } else if (intent === "pick" && isInsertPendingRef.current) {
          isInsertPendingRef.current = false;
          if (node) onInsertAt?.(page.id, node);
        } else if (intent === "pick" && commentPointRef.current) {
          const point = commentPointRef.current;
          commentPointRef.current = null;
          // Picking the element outlines it and saves its id to the server,
          // so the agent can find what the comment points at.
          if (node) {
            setSelectedBox(node);
            onNodeReport?.(page.id, node, "pick");
          }
          setCommentDraft({ ...point, nodeId: node?.nodeId ?? null, body: "" });
        } else if (intent === "pick" && isPickPendingRef.current) {
          isPickPendingRef.current = false;
          if (!node) return;
          setSelectedBox(node);
          onNodeReport?.(page.id, node, "pick");
        } else if (intent === "select") {
          // Null when a rewrite removed the element, so its outline goes too.
          if (!node || node.nodeId !== selectedNodeId) {
            setSelectedBox(null);
            return;
          }
          setSelectedBox(node);
          onNodeReport?.(page.id, node, "select");
          if (pendingEditRef.current === node.nodeId) {
            setPendingEdit(null);
            startTextEdit(node.nodeId);
          }
        }
        return;
      }
      if (payload.type === "wirely-node-text") {
        // Only the element this frame was asked to edit, so a page script
        // cannot rewrite some other element.
        const { nodeId, text } = data as { nodeId?: unknown; text?: unknown };
        if (typeof nodeId !== "string" || nodeId !== editingNodeId) return;
        setEditingNodeId(null);
        // Hands the keyboard back to the editor, or its shortcuts would go to the frame.
        iframeRef.current?.blur();
        window.focus();
        const current = useEditorStore.getState().pages.find((entry) => entry.id === page.id);
        if (typeof text !== "string" || !projectId) return;
        if (current?.iframeHtml !== editStartHtmlRef.current) {
          toast.error("The page changed while you were typing, so the text was not saved.");
          return;
        }
        commitPageEdit(projectId, page.id, (html) => setNodeText(html, nodeId, text.slice(0, 20_000)));
        return;
      }
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
      setContentHeight((previous) =>
        previous === boundedHeight ? previous : boundedHeight,
      );
    },
    [
      currentDevice.height,
      editingNodeId,
      onInsertAt,
      onNodeReport,
      page.id,
      projectId,
      selectedNodeId,
      setPendingEdit,
      startTextEdit,
    ],
  );
  React.useLayoutEffect(() => {
    handleFrameDataRef.current = handleFrameData;
  }, [handleFrameData]);

  React.useEffect(() => {
    if (!isLive) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { id?: unknown } | null;
      if (!data || typeof data !== "object" || data.id !== iframeReporterId) return;
      handleFrameData(data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleFrameData, iframeReporterId, isLive]);

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
          {renderMode === "live" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 py-0.5 pl-2 pr-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
              Live
              <button
                type="button"
                aria-label={`Stop running ${page.title}`}
                title="Stop running scripts (Esc)"
                className="rounded-full p-0.5 transition-colors hover:bg-emerald-500/20"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onLiveChange?.(null);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : null}
          {hoverToolbar}
        </div>
        <div className="relative">
          <div
            ref={frameRef}
            // A project image dragged from the assets folder goes into the
            // element under the drop. A vector page takes no <img>, so it
            // refuses the drop rather than letting the canvas take it.
            onDragOver={(event) => {
              if (!projectId || !event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
              event.stopPropagation();
              if (page.deviceType === "vector") return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              const asset = parseAssetDrag(event.dataTransfer.getData(ASSET_DRAG_TYPE));
              if (!asset || !projectId) return;
              event.preventDefault();
              event.stopPropagation();
              if (page.deviceType === "vector") {
                toast.error("Images go on screen pages. Drop it on a page or on empty canvas.");
                return;
              }
              if (!hasHtml || (!isLiveReady && !inertFrame)) {
                insertAsset(projectId, page.id, asset, "end");
                return;
              }
              pendingAssetRef.current = asset;
              postToFrame({ type: "wirely-node-at", intent: "pick", ...toPagePoint(event.clientX, event.clientY) });
            }}
            className={cn(
              "relative overflow-hidden rounded-[var(--radius)] bg-transparent outline-solid transition-[outline-color] duration-150",
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
            {/* Always this child slot, so React keeps the inert frame mounted
                through the hand-off to live and back. */}
            {inertHtml ? (
              <InertFrame
                html={inertHtml}
                width={currentDevice.width}
                viewportHeight={currentDevice.height}
                isHidden={isLiveReady}
                onMount={setInertFrame}
                onHeightChange={handleInertHeight}
              />
            ) : null}
            {hasHtml && isLive && measuredSrcDoc ? (
              <iframe
                ref={iframeRef}
                title={page.title}
                srcDoc={measuredSrcDoc}
                onLoad={handleLoad}
                className={cn(
                  "relative h-full w-full border-0 bg-background",
                  editingNodeId ? "pointer-events-auto" : "pointer-events-none",
                  inertHtml && !hasLiveLoaded && "opacity-0",
                )}
                style={{ overflow: "hidden" }}
                loading="eager"
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                scrolling="no"
              />
            ) : inertHtml ? null : hasRawHtml ? (
              // Compiling, or a compile that failed, which the live frame can
              // still show with the Tailwind runtime.
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-8 text-center">
                <div className="mt-5 rounded-full border border-border bg-muted px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {currentDevice.label}
                </div>
                {hasInertFailed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLiveChange?.(page.id);
                    }}
                  >
                    Show live
                  </Button>
                ) : null}
              </div>
            ) : status && !isPageIdle ? (
              <GeneratingPreviewPlaceholder />
            ) : page.iframeHtml === undefined ? (
              // The store's placeholder page before the project hydrates.
              <div className="h-full w-full bg-background" />
            ) : (
              // An empty page nothing is writing to, such as the first page of a
              // project an agent just created. A spinner here would never end.
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-background px-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">Empty page</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground/80">
                  Ask your agent to write it, or prompt in the chat.
                </p>
              </div>
            )}
            {pendingEditId ? (
              <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full bg-popover px-2.5 py-1 text-[11px] font-medium text-popover-foreground shadow-md"
                  style={{ transform: "scale(var(--canvas-inverse-zoom, 1))", transformOrigin: "top center" }}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Opening text editing
                </span>
              </div>
            ) : null}
            {(isElementMode || isMoveMode || isCommentMode || insertKind) &&
            hasHtml &&
            (isLive || inertFrame) &&
            !editingNodeId ? (
              <div
                className={cn(
                  "absolute inset-0 z-10",
                  isElementMode || isCommentMode || insertKind ? "cursor-crosshair" : "cursor-default",
                )}
                onPointerMove={(event) => sendPointToFrame(event, "hover")}
                onPointerLeave={() => setHoverBox(null)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  if (isCommentMode) {
                    event.stopPropagation();
                    const point = toFramePoint(event);
                    commentPointRef.current = point;
                    postToFrame({ type: "wirely-node-at", intent: "pick", ...point });
                    return;
                  }
                  if (insertKind) {
                    event.stopPropagation();
                    isInsertPendingRef.current = true;
                    postToFrame({ type: "wirely-node-at", intent: "pick", ...toFramePoint(event) });
                    return;
                  }
                  if (isElementMode) {
                    event.stopPropagation();
                    sendPointToFrame(event, "pick");
                    return;
                  }
                  // The canvas captures the pointer to drag the page, so the
                  // release only reaches window. A release near the press is a
                  // click and picks the element.
                  const point = toFramePoint(event);
                  const { clientX, clientY } = event;
                  window.addEventListener(
                    "pointerup",
                    (upEvent) => {
                      if (Math.hypot(upEvent.clientX - clientX, upEvent.clientY - clientY) >= 4) {
                        return;
                      }
                      isPickPendingRef.current = true;
                      postToFrame({ type: "wirely-node-at", intent: "pick", ...point });
                    },
                    { once: true },
                  );
                }}
              />
            ) : null}
            {(isElementMode || isMoveMode || isCommentMode) &&
            hoverBox &&
            hoverBox.nodeId !== selectedNodeId ? (
              <NodeBox node={hoverBox} variant="hover" />
            ) : null}
            {selectedBox && selectedBox.nodeId === selectedNodeId ? (
              <NodeBox node={selectedBox} variant="selected" />
            ) : null}
            {canMeasure &&
            isAltHeld &&
            selectedBox?.nodeId === selectedNodeId &&
            hoverBox &&
            hoverBox.nodeId !== selectedNodeId ? (
              <MeasureLines from={selectedBox} to={hoverBox} />
            ) : null}
            {dropIndicator ? (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute z-30",
                  dropIndicator.kind === "line" ? "bg-sky-500" : "bg-sky-500/10 outline-dashed outline-sky-500",
                )}
                style={{
                  left: dropIndicator.x,
                  top: dropIndicator.y,
                  // A line's thin side, and a box's outline, stay 2 screen px at any zoom.
                  width: dropIndicator.kind === "line" && dropIndicator.width <= 2 ? DROP_LINE : dropIndicator.width,
                  height: dropIndicator.kind === "line" && dropIndicator.height <= 2 ? DROP_LINE : dropIndicator.height,
                  outlineWidth: DROP_LINE,
                }}
              />
            ) : null}
            {isMoveMode && (isLive || inertFrame) && projectId && !editingNodeId && selectedBox?.nodeId === selectedNodeId && selectedBox ? (
              <ElementEditLayer
                key={selectedBox.nodeId}
                node={selectedBox}
                toPagePoint={toPagePoint}
                onPreviewStyle={(style) =>
                  previewNode({ pageId: page.id, nodeId: selectedBox.nodeId, style })
                }
                onCommitStyle={(style) =>
                  commitPageEdit(projectId, page.id, (html) =>
                    Object.entries(style).reduce<string | null>(
                      (next, [property, value]) =>
                        next === null
                          ? null
                          : setNodeStyle(next, selectedBox.nodeId, property as NodeStyleProperty, value),
                      html,
                    ),
                  )
                }
                pageId={page.id}
                onDrop={(drop, copy) =>
                  dropElement(
                    projectId,
                    { pageId: page.id, nodeId: selectedBox.nodeId, tag: selectedBox.tag },
                    { pageId: drop.pageId, target: drop.target },
                    copy,
                  )
                }
                onClick={(point) => {
                  isPickPendingRef.current = true;
                  postToFrame({ type: "wirely-node-at", intent: "pick", ...point });
                }}
                onDoubleClick={() => startTextEdit(selectedBox.nodeId)}
              />
            ) : null}
            {hasHtml && (isLive || inertFrame) && (isPenMode || (page.deviceType === "vector" && isElementMode)) ? (
              <VectorEditLayer
                html={page.iframeHtml ?? ""}
                width={currentDevice.width}
                height={pageHeight}
                isPenMode={isPenMode}
                selected={selectedBox && selectedBox.nodeId === selectedNodeId ? selectedBox : null}
                onPreviewPath={(nodeId, d) => postToFrame({ type: "wirely-node-preview", nodeId, d })}
                onCommit={(html) => onSavePageHtml?.(page.id, html)}
              />
            ) : null}
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
          {commentDraft ? (
            <div
              ref={commentDraftRef}
              className="absolute z-30 origin-top-left"
              style={{
                left: `${Math.min(commentDraft.x, currentDevice.width - 40)}px`,
                top: `${commentDraft.y}px`,
                transform: "scale(var(--canvas-inverse-zoom, 1))",
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex -translate-y-1/2 items-center gap-1.5 rounded-full border-2 border-violet-500/70 bg-popover py-1 pl-4 pr-1 shadow-xl">
                <input
                  autoFocus
                  value={commentDraft.body}
                  maxLength={MAX_COMMENT_CHARS}
                  placeholder="Add a comment"
                  aria-label="Add a comment"
                  onChange={(event) =>
                    setCommentDraft({ ...commentDraft, body: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && commentDraft.body.trim()) {
                      void postComment();
                    }
                    if (event.key === "Escape") setCommentDraft(null);
                  }}
                  className="min-w-0 w-52 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void postComment()}
                  disabled={!commentDraft.body.trim() || isPostingComment}
                  title="Post comment"
                  aria-label="Post comment"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition-transform hover:bg-violet-500 active:scale-95 disabled:opacity-50"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
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
              // A portal still bubbles through the React tree. Without this, a
              // press on an item reaches the page frame, which starts a drag and
              // captures the pointer, so the item's click never fires.
              onPointerDown={(event) => event.stopPropagation()}
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
          className="top-8 flex h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[1600px]"
        >
          <div className="flex shrink-0 items-center justify-between gap-6 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-sm font-medium leading-6">
                {page.title}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5 text-muted-foreground">
                Pick a breakpoint or drag the edge to resize. Press Escape to close.
              </DialogDescription>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="flex items-center rounded-md border border-border p-0.5">
                {PREVIEW_BREAKPOINTS.map(({ label, width }) => (
                  <button
                    key={width}
                    type="button"
                    disabled={width > previewMaxWidth}
                    title={
                      width > previewMaxWidth
                        ? `${width}px is wider than this window`
                        : `${label}, ${width}px`
                    }
                    onClick={() => setPreviewWidthOverride(width)}
                    className={cn(
                      "rounded px-2 py-1 text-xs tabular-nums transition-colors disabled:opacity-40",
                      previewWidth === width
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {width}
                  </button>
                ))}
              </div>
              {/* The live width, in the same spot whether or not you are
                  dragging, so the number never jumps around mid-drag. */}
              <span className="rounded-md bg-muted/60 px-2 py-1 text-xs tabular-nums text-muted-foreground">
                {previewWidth} x {previewFrameHeight}
              </span>
              {/* Writes the controlled state directly, which is the source of
                  truth. Close clicks were once lost because the canvas took
                  pointer capture on events bubbling out of this portal; see
                  isFromPortal in Canvas.tsx. */}
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

      {projectId ? (
        <PageHistoryDialog
          projectId={projectId}
          pageId={page.id}
          pageTitle={page.title}
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
        />
      ) : null}

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

/** Red distance lines from the picked element to the hovered one, with their px labels. */
function MeasureLines({ from, to }: { from: ReportedNode; to: ReportedNode }) {
  return measureBetween(from, to).map((line) => {
    const isVertical = line.x1 === line.x2;
    return (
      <div
        key={`${line.x1}:${line.y1}:${line.x2}:${line.y2}`}
        aria-hidden="true"
        className="pointer-events-none absolute z-30 bg-rose-500"
        style={{
          left: line.x1,
          top: line.y1,
          width: isVertical ? "calc(1px * var(--canvas-inverse-zoom, 1))" : line.x2 - line.x1,
          height: isVertical ? line.y2 - line.y1 : "calc(1px * var(--canvas-inverse-zoom, 1))",
        }}
      >
        <span
          className="absolute left-1/2 top-1/2 whitespace-nowrap rounded-sm bg-rose-500 px-1 text-[11px] font-medium tabular-nums text-white"
          style={{ transform: "translate(-50%, -50%) scale(var(--canvas-inverse-zoom, 1))" }}
        >
          {line.length}
        </span>
      </div>
    );
  });
}

/** The outline drawn over a hovered or picked element, in page pixels. */
function NodeBox({ node, variant }: { node: ReportedNode; variant: "hover" | "selected" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-20 outline-sky-500",
        variant === "hover" ? "outline-dashed" : "outline-solid",
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        outlineWidth: `calc(${variant === "hover" ? 1 : 2}px * var(--canvas-inverse-zoom, 1))`,
      }}
    >
      {variant === "selected" ? (
        <span
          className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap rounded-sm bg-sky-500 px-1 text-[11px] font-medium text-white"
          style={{ transform: "scale(var(--canvas-inverse-zoom, 1))" }}
        >
          {node.tag}
        </span>
      ) : null}
    </div>
  );
}
