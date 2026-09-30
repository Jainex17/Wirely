/**
 * The one way the editor writes a page the user changed by hand: the
 * inspector, the layers panel, and direct manipulation on the canvas all go
 * through `commitPageEdit`, so each edit shows at once, can be undone, and is
 * put back if the save fails.
 */
import { toast } from "@/components/ui/sonner";
import { htmlHistory } from "@/lib/htmlHistory";
import { logger } from "@/lib/logger";
import { stampNodeIds } from "@/lib/pageNodes";
import {
  duplicateNode,
  type InsertPosition,
  moveNode,
  removeNode,
  setNodeHidden,
  wrapNode,
} from "@/lib/pageTree";
import { useEditorStore } from "@/store/useEditorStore";

/** Saves page HTML, counted in the editor's saving indicator. Throws when the save fails. */
export const persistPageHtml = async (projectId: string, pageId: string, html: string) => {
  const { beginSaving, endSaving } = useEditorStore.getState();
  beginSaving();
  try {
    const response = await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ htmlContent: html }),
    });
    if (!response.ok) throw new Error(`Page save failed with status ${response.status}`);
  } finally {
    endSaving();
  }
};

/**
 * Applies `edit` to the page's current HTML, stamped so node ids resolve,
 * then shows and saves the result. Returns the new HTML, or null when the
 * edit could not apply. `record: false` keeps it out of undo, for the id
 * stamping save and for undo itself.
 */
export const commitPageEdit = (
  projectId: string,
  pageId: string,
  edit: (html: string) => string | null,
  {
    record = true,
    failureMessage = "Could not save the change. Try again.",
    invalidMessage = "This element changed on the page. Pick it again.",
  } = {},
) => {
  const state = useEditorStore.getState();
  const current = state.pages.find((page) => page.id === pageId)?.iframeHtml;
  if (current === undefined) return null;
  const next = edit(stampNodeIds(current));
  if (next === null) {
    toast.error(invalidMessage);
    return null;
  }
  if (next === current) return next;

  state.setPageHtml(pageId, next);
  if (record) htmlHistory.record({ pageId, before: current, after: next });
  persistPageHtml(projectId, pageId, next).catch((error: unknown) => {
    logger.error("page_edit_save_failed", { pageId, projectId, error });
    // Only put the old HTML back if nothing newer landed since.
    const latest = useEditorStore.getState();
    if (latest.pages.find((page) => page.id === pageId)?.iframeHtml === next) {
      latest.setPageHtml(pageId, current);
    }
    toast.error(failureMessage);
  });
  return next;
};

export type ElementAction = "duplicate" | "delete" | "wrap" | "hide" | "show";

/**
 * Runs a layer action on the picked element, then selects what the user would
 * expect next: the copy, the new frame, or nothing after a delete.
 */
export const runElementAction = (projectId: string, action: ElementAction) => {
  const { selectedNode } = useEditorStore.getState();
  if (!selectedNode) return;
  const { pageId, nodeId } = selectedNode;
  let newId: string | null = null;
  const next = commitPageEdit(projectId, pageId, (html) => {
    if (action === "duplicate" || action === "wrap") {
      const result = action === "duplicate" ? duplicateNode(html, nodeId) : wrapNode(html, nodeId);
      newId = result?.newId ?? null;
      return result?.html ?? null;
    }
    if (action === "delete") return removeNode(html, nodeId);
    return setNodeHidden(html, nodeId, action === "hide");
  });
  if (next === null) return;
  const { setSelectedNode } = useEditorStore.getState();
  if (action === "delete") {
    setSelectedNode(null);
  } else if (newId) {
    setSelectedNode({
      pageId,
      nodeId: newId,
      tag: action === "wrap" ? "div" : selectedNode.tag,
      color: null,
      background: null,
    });
  }
};

/** Moves an element next to or into another on the same page. */
export const moveElement = (
  projectId: string,
  pageId: string,
  nodeId: string,
  targetId: string,
  position: InsertPosition,
) =>
  commitPageEdit(projectId, pageId, (html) => moveNode(html, nodeId, targetId, position), {
    invalidMessage: "An element cannot go there. Drop it next to or into another element.",
  });
