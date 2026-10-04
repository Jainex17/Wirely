/**
 * The one way the editor writes a page the user changed by hand: the
 * inspector, the layers panel, and direct manipulation on the canvas all go
 * through `commitPageEdit`, so each edit shows at once, can be undone, and is
 * put back if the save fails.
 */
import { toast } from "@/components/ui/sonner";
import { assetArtboardHtml, assetImageMarkup, type DraggedAsset } from "@/lib/assetDrag";
import { htmlHistory } from "@/lib/htmlHistory";
import { logger } from "@/lib/logger";
import { freezeElement } from "@/lib/nodeFreeze";
import { stampNodeIds } from "@/lib/pageNodes";
import {
  appendToPage,
  carryIconStylesheet,
  copyNode,
  type DropTarget,
  duplicateNode,
  insertAtNode,
  insertNode,
  type InsertPosition,
  moveNode,
  removeNode,
  setNodeHidden,
  transferNode,
  wrapNode,
} from "@/lib/pageTree";
import { readArtboardSize } from "@/lib/vectorArtboard";
import { getCanvasFrame } from "@/store/canvasDrop";
import { useEditorStore } from "@/store/useEditorStore";

/**
 * Saves one page through its own route, or several through the batch route,
 * which writes all of them or none. Counted in the editor's saving indicator.
 * Throws when the save fails.
 */
const persistPagesHtml = async (projectId: string, pages: Array<{ pageId: string; html: string }>) => {
  const { beginSaving, endSaving } = useEditorStore.getState();
  beginSaving();
  try {
    const [only] = pages;
    const response =
      pages.length === 1
        ? await fetch(`/api/projects/${projectId}/pages/${only.pageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlContent: only.html }),
          })
        : await fetch(`/api/projects/${projectId}/pages`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pages: pages.map(({ pageId, html }) => ({ id: pageId, htmlContent: html })) }),
          });
    if (!response.ok) throw new Error(`Page save failed with status ${response.status}`);
  } finally {
    endSaving();
  }
};

interface CommitOptions {
  /** False keeps the edit out of undo, for the id stamping save and for undo itself. */
  record?: boolean;
  failureMessage?: string;
  invalidMessage?: string;
}

/**
 * Applies an edit to each listed page's current HTML, stamped so node ids
 * resolve, then shows and saves the results together. Returns the new HTML
 * per page, or null when any edit could not apply, in which case no page
 * changes. A failed save puts every page back.
 */
export const commitPagesEdit = (
  projectId: string,
  edits: Record<string, (html: string) => string | null>,
  {
    record = true,
    failureMessage = "Could not save the change. Try again.",
    invalidMessage = "This element changed on the page. Pick it again.",
  }: CommitOptions = {},
) => {
  const state = useEditorStore.getState();
  const changes: Array<{ pageId: string; before: string; after: string }> = [];
  for (const [pageId, edit] of Object.entries(edits)) {
    const before = state.pages.find((page) => page.id === pageId)?.iframeHtml;
    if (before === undefined) return null;
    const after = edit(stampNodeIds(before));
    if (after === null) {
      toast.error(invalidMessage);
      return null;
    }
    changes.push({ pageId, before, after });
  }
  const result = Object.fromEntries(changes.map(({ pageId, after }) => [pageId, after]));
  const changed = changes.filter(({ before, after }) => before !== after);
  if (changed.length === 0) return result;

  for (const { pageId, after } of changed) state.setPageHtml(pageId, after);
  if (record) htmlHistory.record(changed);
  persistPagesHtml(
    projectId,
    changed.map(({ pageId, after }) => ({ pageId, html: after })),
  ).catch((error: unknown) => {
    logger.error("page_edit_save_failed", { pageIds: changed.map(({ pageId }) => pageId), projectId, error });
    // The pages go back together or not at all. Putting back only the pages
    // nothing newer landed on would, for a move, take the element off the
    // target while the source keeps a later edit made without it.
    const latest = useEditorStore.getState();
    const htmlOf = (pageId: string) => latest.pages.find((page) => page.id === pageId)?.iframeHtml;
    if (changed.every(({ pageId, after }) => htmlOf(pageId) === after)) {
      for (const { pageId, before } of changed) latest.setPageHtml(pageId, before);
    }
    toast.error(failureMessage);
  });
  return result;
};

/** `commitPagesEdit` for one page. Returns its new HTML, or null when the edit could not apply. */
export const commitPageEdit = (
  projectId: string,
  pageId: string,
  edit: (html: string) => string | null,
  options?: CommitOptions,
) => commitPagesEdit(projectId, { [pageId]: edit }, options)?.[pageId] ?? null;

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

const pageHtml = (pageId: string) =>
  useEditorStore.getState().pages.find((page) => page.id === pageId)?.iframeHtml ?? null;

const selectNew = (pageId: string, nodeId: string, tag: string) => {
  const { setFocusedPage, setSelectedNode } = useEditorStore.getState();
  setFocusedPage(pageId);
  setSelectedNode({ pageId, nodeId, tag, color: null, background: null });
};

/**
 * The element as markup that renders the same on any page, read from how the
 * canvas drew it. Null when the page is not drawn yet or the element is gone.
 */
const frozenMarkup = (pageId: string, nodeId: string) => {
  const html = pageHtml(pageId);
  const frame = getCanvasFrame(pageId);
  return html !== null && frame ? freezeElement(html, nodeId, frame.root) : null;
};

/**
 * Moves or copies an element to a drop anywhere on the canvas, then picks it
 * where it landed. On its own page the markup moves as it is, since the same
 * CSS applies. To another page it goes self-contained, and both pages save
 * together, so a failed save never loses or doubles it.
 */
export const dropElement = (
  projectId: string,
  from: { pageId: string; nodeId: string; tag: string },
  to: { pageId: string; target: DropTarget },
  copy: boolean,
) => {
  const invalidMessage = "An element cannot go there. Drop it next to or into another element.";
  if (from.pageId === to.pageId) {
    if (to.target === "end") return;
    const { nodeId: targetId, position } = to.target;
    if (!copy) {
      moveElement(projectId, from.pageId, from.nodeId, targetId, position);
      return;
    }
    let newId: string | null = null;
    const next = commitPageEdit(
      projectId,
      from.pageId,
      (html) => {
        const result = copyNode(html, from.nodeId, targetId, position);
        newId = result?.newId ?? null;
        return result?.html ?? null;
      },
      { invalidMessage },
    );
    if (next !== null && newId) selectNew(from.pageId, newId, from.tag);
    return;
  }

  const markup = frozenMarkup(from.pageId, from.nodeId);
  const sourceHtml = pageHtml(from.pageId);
  if (markup === null || sourceHtml === null) {
    toast.error("This element changed on the page. Pick it again.");
    return;
  }
  let newId: string | null = null;
  const edits: Record<string, (html: string) => string | null> = {
    [to.pageId]: (html) => {
      const result = transferNode({
        sourceHtml,
        targetHtml: html,
        nodeId: from.nodeId,
        target: to.target,
        markup,
        copy: true,
      });
      newId = result?.newId ?? null;
      return result?.target ?? null;
    },
  };
  if (!copy) edits[from.pageId] = (html) => removeNode(html, from.nodeId);
  const next = commitPagesEdit(projectId, edits, { invalidMessage });
  if (next !== null && newId) selectNew(to.pageId, newId, from.tag);
};

/**
 * The element Cmd+C or Cmd+X took, self-contained so it pastes the same into
 * any page. Module state, so it outlives a switch between projects.
 */
let clipboard: { markup: string; sourceHtml: string; tag: string } | null = null;

/** Copies the picked element, and with `cut` removes it. Returns whether anything was copied. */
export const copySelectedElement = (projectId: string, cut: boolean) => {
  const { selectedNode } = useEditorStore.getState();
  if (!selectedNode) return false;
  const { pageId, nodeId, tag } = selectedNode;
  const markup = frozenMarkup(pageId, nodeId);
  const sourceHtml = pageHtml(pageId);
  if (markup === null || sourceHtml === null) return false;
  clipboard = { markup, sourceHtml, tag };
  // Also as text, so the element can be pasted into a prompt or a code editor.
  void navigator.clipboard?.writeText(markup).catch(() => undefined);
  if (cut) {
    const next = commitPageEdit(projectId, pageId, (html) => removeNode(html, nodeId));
    if (next !== null) useEditorStore.getState().setSelectedNode(null);
  }
  return true;
};

/**
 * Pastes the copied element right after the picked element, as its sibling,
 * or at the end of the focused page when nothing is picked. Returns whether
 * anything was pasted.
 */
export const pasteElement = (projectId: string) => {
  if (!clipboard) return false;
  const { markup, sourceHtml, tag } = clipboard;
  const { selectedNode, focusedPageId, pages } = useEditorStore.getState();
  const pageId = selectedNode?.pageId ?? focusedPageId;
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!pageId || !page || page.deviceType === "vector") return false;
  let newId: string | null = null;
  const next = commitPageEdit(
    projectId,
    pageId,
    (html) => {
      const result = selectedNode
        ? insertNode(html, selectedNode.nodeId, "after", markup)
        : appendToPage(html, markup);
      newId = result?.newId ?? null;
      return result ? carryIconStylesheet(sourceHtml, result.html) : null;
    },
    { invalidMessage: "The element cannot go there. Pick another element." },
  );
  if (next !== null && newId) selectNew(pageId, newId, tag);
  return true;
};

/**
 * Drops a project image into a page and picks it: relative to a layer from the
 * layers panel, at the end of a page dropped on in the pages panel, or at the
 * element under the drop on the canvas.
 */
export const insertAsset = (
  projectId: string,
  pageId: string,
  asset: DraggedAsset,
  target: { nodeId: string; position: InsertPosition } | { nodeId: string; isSvg: boolean } | "end",
) => {
  let newId: string | null = null;
  const markup = assetImageMarkup(asset);
  const next = commitPageEdit(
    projectId,
    pageId,
    (html) => {
      const result =
        target === "end"
          ? appendToPage(html, markup)
          : "position" in target
            ? insertNode(html, target.nodeId, target.position, markup)
            : insertAtNode(html, target, markup);
      newId = result?.newId ?? null;
      return result?.html ?? null;
    },
    { invalidMessage: "The image cannot go there. Drop it on another element." },
  );
  if (next === null || !newId) return;
  const { setFocusedPage, setSelectedNode } = useEditorStore.getState();
  setFocusedPage(pageId);
  setSelectedNode({ pageId, nodeId: newId, tag: "img", color: null, background: null });
};

/**
 * Makes a dropped project image its own page: a vector page the size of the
 * image, centred on the drop point, the same kind of page an agent's add_page
 * makes for artwork that is not a screen. The pages API creates a page empty,
 * so a failed save of its image deletes it again.
 */
export const createAssetPage = async (projectId: string, asset: DraggedAsset, center: { x: number; y: number }) => {
  const { beginSaving, endSaving } = useEditorStore.getState();
  beginSaving();
  // The page is created with its image in one request, so a failure leaves
  // nothing behind to roll back.
  let page: { id: string; htmlContent: string };
  try {
    const response = await fetch(`/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: asset.name, deviceType: "vector", htmlContent: assetArtboardHtml(asset) }),
    });
    const payload = (await response.json().catch(() => null)) as {
      page?: { id: string; htmlContent: string };
    } | null;
    if (!response.ok || !payload?.page) throw new Error(`Page creation failed with status ${response.status}`);
    page = payload.page;
  } catch (error) {
    logger.error("asset_page_create_failed", { projectId, error });
    toast.error("Could not add the image. Try again.");
    return;
  } finally {
    endSaving();
  }
  const { width, height } = readArtboardSize(page.htmlContent);
  const state = useEditorStore.getState();
  state.createPage(asset.name, undefined, page.id, "vector");
  state.setPagePosition(page.id, { x: center.x - width / 2, y: center.y - height / 2 });
  state.setFocusedPage(page.id);
  state.setPageHtml(page.id, page.htmlContent);
};
