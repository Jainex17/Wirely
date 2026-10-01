"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/sonner";
import {
  type CanvasTool,
  getDefaultPageX,
  getPageBounds,
  getPageFrameSize,
  getViewportBounds,
  isBoundsIntersecting,
  isInsertTool,
} from "@/lib/canvasScene";
import { htmlHistory } from "@/lib/htmlHistory";
import { logger } from "@/lib/logger";
import { type ReportedNode, requestTextEdit } from "@/lib/nodePicker";
import { findNodeSpan, getNodeText, readNodeLink, stampNodeIds } from "@/lib/pageNodes";
import { buildLayerTree, findLayer, findLayerParent, INSERT_MARKUP, insertNode } from "@/lib/pageTree";
import { commitPageEdit, type ElementAction, runElementAction } from "@/store/pageEdits";
import { useEditorStore } from "@/store/useEditorStore";
import Canvas from "./Canvas";

interface EditorWorkspaceProps {
  sidebarMode?: "default" | "wire";
  projectId?: string;
  onEditPage?: (pageId: string) => void;
}

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));

export default function EditorWorkspace({
  sidebarMode = "default",
  projectId,
  onEditPage,
}: EditorWorkspaceProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const hasInitializedViewportRef = useRef(false);
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [isSpacePanning, setIsSpacePanning] = useState(false);

  const {
    camera,
    activeDevice,
    pagePositions,
    pageFrameHeights,
    pages,
    requestedGeneratedPageFocusIds,
    beginSaving,
    endSaving,
    focusedPageId,
    viewportWidth,
    setViewportSize,
    stepZoom,
    setZoom,
    focusPages,
    focusPage,
    setSelectedNode,
    fitAllPages,
    fitPage,
    clearRequestedGeneratedPageFocusCheck,
    setSelectedSection,
    renamePage,
    deletePage,
    hydrateProject,
  } = useEditorStore(
    useShallow((state) => ({
      camera: state.camera,
      activeDevice: state.activeDevice,
      pagePositions: state.pagePositions,
      pageFrameHeights: state.pageFrameHeights,
      pages: state.pages,
      requestedGeneratedPageFocusIds: state.requestedGeneratedPageFocusIds,
      beginSaving: state.beginSaving,
      endSaving: state.endSaving,
      focusedPageId: state.focusedPageId,
      viewportWidth: state.viewportSize.width,
      setViewportSize: state.setViewportSize,
      stepZoom: state.stepZoom,
      setZoom: state.setZoom,
      focusPages: state.focusPages,
      focusPage: state.focusPage,
      setSelectedNode: state.setSelectedNode,
      fitAllPages: state.fitAllPages,
      fitPage: state.fitPage,
      clearRequestedGeneratedPageFocusCheck: state.clearRequestedGeneratedPageFocusCheck,
      setSelectedSection: state.setSelectedSection,
      renamePage: state.renamePage,
      deletePage: state.deletePage,
      hydrateProject: state.hydrateProject,
    })),
  );

  const pageBoundsById = useMemo(() => {
    const result = new Map<string, ReturnType<typeof getPageBounds>>();
    for (const [index, page] of pages.entries()) {
      const { width: deviceWidth, height: deviceHeight } = getPageFrameSize(page, activeDevice);
      const position = pagePositions[page.id] ?? {
        x: getDefaultPageX(index, pages.length, deviceWidth),
        y: 0,
      };
      const height = Math.max(
        deviceHeight,
        pageFrameHeights[page.id] ?? deviceHeight,
      );

      result.set(
        page.id,
        getPageBounds({
          pageId: page.id,
          position,
          width: deviceWidth,
          height,
        }),
      );
    }
    return result;
  }, [
    activeDevice,
    pageFrameHeights,
    pagePositions,
    pages,
  ]);

  const handleCanvasClick = useCallback(() => {
    if (activeTool === "grab" || isSpacePanning) return;
    setSelectedSection(null);
  }, [activeTool, isSpacePanning, setSelectedSection]);

  const handleRenamePage = useCallback(
    async (pageId: string, newTitle: string) => {
      // Read at call time so the handler does not change, and re-render every
      // memoized page frame, whenever any page changes.
      const existingPage = useEditorStore
        .getState()
        .pages.find((page) => page.id === pageId);
      if (!existingPage) return;

      renamePage(pageId, newTitle);

      if (!projectId) return;

      beginSaving();
      try {
        const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });

        if (!response.ok) {
          throw new Error(`Rename failed with status ${response.status}`);
        }
      } catch (error) {
        logger.error("pages_rename_failed", { pageId, projectId, error });
        renamePage(pageId, existingPage.title);
        toast.error("Could not rename page. Please try again.");
      } finally {
        endSaving();
      }
    },
    [beginSaving, endSaving, projectId, renamePage],
  );

  const handleDeletePage = useCallback(
    async (pageId: string) => {
      const page = useEditorStore
        .getState()
        .pages.find((candidate) => candidate.id === pageId);
      if (!page) return;

      deletePage(pageId);

      if (!projectId) return;

      beginSaving();
      try {
        const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`Delete failed with status ${response.status}`);
        }
        toast.success("Page deleted.");
      } catch (error) {
        logger.error("pages_delete_failed", { pageId, projectId, error });
        toast.error("Could not delete page. Restoring latest server data.");

        try {
          const reloadResponse = await fetch(`/api/projects/${projectId}`, {
            cache: "no-store",
          });
          if (!reloadResponse.ok) {
            throw new Error(`Reload failed with status ${reloadResponse.status}`);
          }
          const payload = (await reloadResponse.json()) as {
            pages?: Array<{ id: string; title: string; htmlContent: string }>;
          };
          const reloadedPages =
            payload.pages?.map((item) => ({
              id: item.id,
              title: item.title,
              iframeHtml: item.htmlContent,
              sections: [] as string[],
            })) ?? [];
          hydrateProject(reloadedPages);
        } catch (reloadError) {
          logger.error("pages_reload_after_delete_failure", {
            pageId,
            projectId,
            reloadError,
          });
          toast.error("Could not restore latest server data.");
        }
      } finally {
        endSaving();
      }
    },
    [beginSaving, deletePage, endSaving, hydrateProject, projectId],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setViewportSize({ width, height });
    });
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setViewportSize]);

  useEffect(() => {
    hasInitializedViewportRef.current = false;
  }, [projectId]);

  // A project whose camera shows no page on open starts fitted to the top of
  // every page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pages.length === 0 || viewportWidth === 0) return;
    if (hasInitializedViewportRef.current) return;

    const viewportBounds = getViewportBounds(camera, {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
    const hasVisiblePage = pages.some((page) => {
      const bounds = pageBoundsById.get(page.id);
      return bounds ? isBoundsIntersecting(bounds, viewportBounds) : false;
    });

    hasInitializedViewportRef.current = true;
    // An element link opens on its page with the element picked.
    const link = readNodeLink(window.location.search);
    if (link && pages.some((page) => page.id === link.pageId)) {
      focusPage(link.pageId);
      if (link.nodeId) {
        setSelectedNode({
          pageId: link.pageId,
          nodeId: link.nodeId,
          tag: "",
          color: null,
          background: null,
        });
      }
      return;
    }
    if (!hasVisiblePage) {
      fitAllPages();
    }
  }, [camera, fitAllPages, focusPage, pageBoundsById, pages, setSelectedNode, viewportWidth]);

  /** Saves a pen tool edit, recorded so Cmd+Z can take it back. */
  const commitCanvasEdit = useCallback(
    (pageId: string, html: string) => {
      if (projectId) commitPageEdit(projectId, pageId, () => html);
    },
    [projectId],
  );

  const stepHistory = useCallback(
    (direction: "undo" | "redo") => {
      const result = htmlHistory.step(
        direction,
        (pageId) => useEditorStore.getState().pages.find((page) => page.id === pageId)?.iframeHtml,
      );
      if (result === "stale") {
        toast.error("The page changed since that edit. Open the page's History to go further back.");
      } else if (result && projectId) {
        commitPageEdit(projectId, result.pageId, () => result.html, { record: false });
      }
    },
    [projectId],
  );

  /**
   * Adds the active insert tool's element where the click landed: inside an
   * empty or containing element, after text, images, and icons. Then picks it,
   * and starts typing into new text.
   */
  const handleInsertAt = useCallback(
    (pageId: string, node: ReportedNode) => {
      if (!projectId || !isInsertTool(activeTool)) return;
      const kind = activeTool;
      let newId: string | null = null;
      const next = commitPageEdit(projectId, pageId, (html) => {
        const span = findNodeSpan(html, node.nodeId);
        if (!span) return null;
        const isVoid = span.end === span.openEnd;
        const holdsText = getNodeText(html, node.nodeId) !== null;
        const position = isVoid || holdsText || node.isSvg ? "after" : "inside";
        const result = insertNode(html, node.nodeId, position, INSERT_MARKUP[kind]);
        newId = result?.newId ?? null;
        return result?.html ?? null;
      });
      setActiveTool("select");
      if (next === null || !newId) return;
      useEditorStore.getState().setSelectedNode({
        pageId,
        nodeId: newId,
        tag: kind === "text" ? "p" : "div",
        color: null,
        background: null,
      });
      if (kind === "text") requestTextEdit(pageId, newId);
    },
    [activeTool, projectId],
  );

  const handleNodeReport = useCallback(
    (pageId: string, node: ReportedNode, intent: "pick" | "select") => {
      const state = useEditorStore.getState();
      const next = {
        pageId,
        nodeId: node.nodeId,
        tag: node.tag,
        color: node.color,
        background: node.background,
        styles: node.styles,
        isSvg: node.isSvg,
        x: node.x,
        y: node.y,
      };
      const current = state.selectedNode;
      if (intent === "select") {
        // A re-measure of the picked element. Only its reported details change.
        if (current?.pageId !== pageId || current.nodeId !== node.nodeId) return;
        if (
          current.tag === next.tag &&
          current.color === next.color &&
          current.background === next.background &&
          current.isSvg === next.isSvg &&
          JSON.stringify(current.styles) === JSON.stringify(next.styles)
        ) {
          return;
        }
        state.setSelectedNode(next);
        return;
      }

      state.setFocusedPage(pageId);
      state.setSelectedNode(next);

      // The frame reported an id stamped into its srcdoc. Saving the stamped
      // HTML the first time makes that id exist on the server too, so a
      // sidebar edit or an MCP agent can find the element. A page mid-run is
      // left alone: the run writes it.
      const page = state.pages.find((candidate) => candidate.id === pageId);
      const html = page?.iframeHtml ?? "";
      const stamped = stampNodeIds(html);
      const status = state.pageStatuses[pageId]?.status;
      const isBusy = status === "queued" || status === "generating" || status === "repairing";
      if (!projectId || stamped === html || isBusy) return;

      commitPageEdit(projectId, pageId, (html) => html, {
        record: false,
        failureMessage: "Could not save the page, so element links to it may not work yet.",
      });
    },
    [projectId],
  );

  useEffect(() => {
    if (!requestedGeneratedPageFocusIds || requestedGeneratedPageFocusIds.length === 0) {
      return;
    }
    if (!canvasRef.current) {
      return;
    }

    const viewportBounds = getViewportBounds(camera, {
      width: canvasRef.current.clientWidth,
      height: canvasRef.current.clientHeight,
    });
    const generatedBounds = requestedGeneratedPageFocusIds
      .map((pageId) => pageBoundsById.get(pageId))
      .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds));
    const hasVisibleGeneratedPage = generatedBounds.some((bounds) =>
      isBoundsIntersecting(bounds, viewportBounds),
    );

    if (!hasVisibleGeneratedPage) {
      focusPages(requestedGeneratedPageFocusIds);
    }

    clearRequestedGeneratedPageFocusCheck();
  }, [
    camera,
    clearRequestedGeneratedPageFocusCheck,
    focusPages,
    pageBoundsById,
    requestedGeneratedPageFocusIds,
  ]);

  useEffect(() => {
    // Figma's bindings: V, H, E, P, and C pick a tool, Shift+1 fits every page, Shift+2
    // the selected one, Shift+0 goes to 100%. Digits match on `code` because
    // Shift turns the `key` for 1 into "!".
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        setActiveTool((tool) => (tool === "comment" ? "select" : tool));
      }

      if (event.code === "Space") {
        if (!event.repeat) {
          setIsSpacePanning(true);
        }
        event.preventDefault();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.code === "KeyZ") {
        stepHistory(event.shiftKey ? "redo" : "undo");
        event.preventDefault();
        return;
      }

      // Figma's element shortcuts, for the picked element. A vector page's
      // root <svg> is the artboard, so deleting it is not offered.
      const { selectedNode, pages } = useEditorStore.getState();
      const isArtboard =
        selectedNode?.tag === "svg" &&
        pages.find((page) => page.id === selectedNode.pageId)?.deviceType === "vector";
      if (projectId && selectedNode) {
        const isCommand = event.metaKey || event.ctrlKey;
        const action: ElementAction | null =
          !isCommand && (event.key === "Delete" || event.key === "Backspace") && !isArtboard
            ? "delete"
            : isCommand && !event.altKey && event.code === "KeyD"
              ? "duplicate"
              : isCommand && event.altKey && event.code === "KeyG"
                ? "wrap"
                : null;
        if (action) {
          runElementAction(projectId, action);
          event.preventDefault();
          return;
        }
        // Enter goes into the element and Shift+Enter out to its parent.
        if (event.key === "Enter" && !isCommand) {
          const html = pages.find((page) => page.id === selectedNode.pageId)?.iframeHtml ?? "";
          const layers = buildLayerTree(html);
          const nextId = event.shiftKey
            ? findLayerParent(layers, selectedNode.nodeId)
            : findLayer(layers, selectedNode.nodeId)?.children[0]?.id;
          const next = nextId ? findLayer(layers, nextId) : null;
          if (next) {
            useEditorStore.getState().setSelectedNode({
              pageId: selectedNode.pageId,
              nodeId: next.id,
              tag: next.tag,
              color: null,
              background: null,
            });
          }
          event.preventDefault();
          return;
        }
      }

      // Leave other Cmd and Ctrl chords, like browser zoom, to the browser.
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const action = event.shiftKey
        ? {
            Digit0: () => setZoom(100),
            Equal: () => stepZoom(1),
            Digit1: fitAllPages,
            Digit2: () => {
              if (focusedPageId) fitPage(focusedPageId);
            },
          }[event.code]
        : {
            KeyV: () => setActiveTool("select"),
            KeyH: () => setActiveTool("grab"),
            KeyE: () => setActiveTool("element"),
            KeyP: () => setActiveTool("pen"),
            KeyC: () => setActiveTool("comment"),
            KeyF: () => setActiveTool("frame"),
            KeyT: () => setActiveTool("text"),
            KeyR: () => setActiveTool("rectangle"),
            Equal: () => stepZoom(1),
            NumpadAdd: () => stepZoom(1),
            Minus: () => stepZoom(-1),
            NumpadSubtract: () => stepZoom(-1),
          }[event.code];
      if (!action) return;

      action();
      event.preventDefault();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setIsSpacePanning(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePanning(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [fitAllPages, fitPage, focusedPageId, projectId, setZoom, stepHistory, stepZoom]);

  return (
    <div data-sidebar-mode={sidebarMode} className="relative h-full w-full">
      <Canvas
        canvasRef={canvasRef}
        projectId={projectId}
        activeTool={activeTool}
        isSpacePanning={isSpacePanning}
        onCanvasClick={handleCanvasClick}
        onRenamePage={handleRenamePage}
        onDeletePage={handleDeletePage}
        onEditPage={onEditPage}
        onToolChange={setActiveTool}
        onNodeReport={handleNodeReport}
        onSavePageHtml={commitCanvasEdit}
        onInsertAt={handleInsertAt}
      />
    </div>
  );
}
