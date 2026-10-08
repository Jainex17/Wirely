/**
 * Cut, copy, and paste for the design canvas, on the browser's own clipboard
 * events so Cmd+C, Cmd+X, and Cmd+V work like in Figma: between screens, between
 * projects, and from Figma or another design tool that puts HTML on the
 * clipboard. Pasted images become image layers.
 *
 * The engine writes a copy as HTML for other apps and keeps a snapshot of the
 * nodes for itself. The last copy stays in memory, so a paste of the same HTML
 * back into Wirely uses the exact snapshot instead of parsing the HTML again.
 */
import type { Editor } from "@open-pencil/core/editor";
import { extractImageFilesFromClipboard } from "@open-pencil/vue";
import { isTypingTarget } from "@/components/design/keyboard";
import { useEditorStore } from "@/store/useEditorStore";

type Payload = Awaited<ReturnType<Editor["prepareCopy"]>>;

let lastCopy: Payload | null = null;

/** The event is for a text field, the text being edited, or the Prototype tab, so the canvas leaves it alone. */
const isNotForCanvas = (editor: Editor, event: Event) =>
  isTypingTarget(event.target) || editor.state.editingTextId !== null || useEditorStore.getState().canvasView !== "design";

const hasPageTextSelection = () => (window.getSelection()?.toString() ?? "") !== "";

const copySelection = async (editor: Editor) => {
  const nodes = editor.getSelectedNodes();
  if (nodes.length === 0) return false;
  const payload = await editor.prepareCopy();
  lastCopy = payload;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.plainText || " "], { type: "text/plain" }),
      }),
    ]);
  } catch {
    // Without clipboard permission the copy still pastes inside Wirely.
  }
  return true;
};

/** Where a paste lands: the pointer on the canvas, or the middle of the view. */
const pastePoint = (editor: Editor) => {
  const { cursorCanvasX, cursorCanvasY } = editor.state;
  return cursorCanvasX != null && cursorCanvasY != null ? { x: cursorCanvasX, y: cursorCanvasY } : undefined;
};

/** Listens for clipboard events on the window. Returns the function that stops listening. */
export const bindDesignClipboard = (editor: Editor) => {
  const onCopy = (event: ClipboardEvent) => {
    if (isNotForCanvas(editor, event) || hasPageTextSelection() || editor.state.selectedIds.size === 0) return;
    event.preventDefault();
    void copySelection(editor);
  };

  const onCut = (event: ClipboardEvent) => {
    if (isNotForCanvas(editor, event) || editor.state.selectedIds.size === 0) return;
    event.preventDefault();
    void copySelection(editor).then((copied) => copied && editor.deleteSelected());
  };

  const onPaste = (event: ClipboardEvent) => {
    if (isNotForCanvas(editor, event)) return;
    event.preventDefault();
    const point = pastePoint(editor);

    const images = extractImageFilesFromClipboard(event);
    if (images.length > 0) {
      const { panX, panY, zoom } = editor.state;
      void editor.placeImageFiles(images, point?.x ?? (window.innerWidth / 2 - panX) / zoom, point?.y ?? (window.innerHeight / 2 - panY) / zoom);
      return;
    }

    const html = event.clipboardData?.getData("text/html") || lastCopy?.html || "";
    if (!html) return;
    if (lastCopy?.snapshot && html === lastCopy.html) {
      void editor.pasteSnapshot(lastCopy.snapshot, point);
    } else {
      void editor.pasteFromHTML(html, point);
    }
  };

  window.addEventListener("copy", onCopy);
  window.addEventListener("cut", onCut);
  window.addEventListener("paste", onPaste);
  return () => {
    window.removeEventListener("copy", onCopy);
    window.removeEventListener("cut", onCut);
    window.removeEventListener("paste", onPaste);
  };
};
